import { Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionHandler, SessionStartEvent, ExtensionContext } from "@mariozechner/pi-coding-agent";

async function fetchPPQModels(): Promise<Model<any>[]> {
    try {
        console.log("Fetching models from PPQ.ai...");
        const response = await fetch("https://api.ppq.ai/v1/models");
        const data = await response.json();

        const models: Model<any>[] = [];
        
        // tool support ???
        for (const model of data.data) {
            models.push({
                id: model.id,
                name: model.name,
                api: "openai-completions",
                baseUrl: "https://api.ppq.ai",
                provider: "ppq",
                reasoning: false, // ???
                input: ["text"],
                cost: {
                    input: model.pricing.input_per_1M_tokens,
                    output: model.pricing.output_per_1M_tokens,
                    cacheRead: 0,
                    cacheWrite: 0,
                },
                contextWindow: model.context_length,
                maxTokens: 4096,
            });
        }
        
        // Set "autoclaw" to be the first model
        models.sort((a, b) => a.name == "autoclaw" ? -1 : (b.name == "autoclaw" ? 1 : 0));

        console.log(`Fetched ${models.length} models from PPQ.ai`);
        return models;
    } catch (error) {
        console.error("Failed to fetch PPQ.ai models:", error);
        return [];
    }
}

const extensionInstalledCustomType = "ppq-extension-installed";

interface ExtensionInstalledData {
    lastUpdateTimestamp: number
}

function getExtensionInstlledEntryData(ctx: ExtensionContext) {
    for (const entry of ctx.sessionManager.getEntries()) {
        if (entry.type == "custom" && entry.customType == extensionInstalledCustomType) {
            console.log(`entry(custom): ${JSON.stringify(entry)}`);
            return entry.data as ExtensionInstalledData;
        }
    }
    return null;
}

export default async function (pi: ExtensionAPI) {
    const onSessionStart : ExtensionHandler<SessionStartEvent> =  async (_event, ctx) => { 
        const savedData = getExtensionInstlledEntryData(ctx);
        const millisecondsInDay = 24 * 60 * 60 * 1000;
        const oneDayAgo = Date.now() - millisecondsInDay;
        if (savedData !== null && savedData.lastUpdateTimestamp > oneDayAgo) {
            return;
        }
        
        const models = await fetchPPQModels();

        pi.registerProvider("ppq", {
            baseUrl: "https://api.ppq.ai",
            api: "openai-completions",
            apiKey: "PPQ_API_KEY",
            models: models
        });

        const dataToSave : ExtensionInstalledData = { lastUpdateTimestamp: Date.now() };
        pi.appendEntry(extensionInstalledCustomType, dataToSave);
        getExtensionInstlledEntryData(ctx);
        console.log(`something`);

        const autoclawModel = ctx.modelRegistry.find("ppq", "autoclaw");
        if (savedData === null && autoclawModel) {
            await pi.setModel(autoclawModel);
        }            
    };

    pi.on("session_start", onSessionStart);
}

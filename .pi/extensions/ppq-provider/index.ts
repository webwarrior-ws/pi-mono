import { Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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
        
        // Set "autoclaw" to be the first model (selected by default)
        models.sort((a, b) => a.name == "autoclaw" ? -1 : (b.name == "autoclaw" ? 1 : 0));

        console.log(`Fetched ${models.length} models from PPQ.ai`);
        return models;
    } catch (error) {
        console.error("Failed to fetch PPQ.ai models:", error);
        return [];
    }
}

export default async function (pi: ExtensionAPI) {
    const models = await fetchPPQModels();

    pi.registerProvider("ppq", {
        baseUrl: "https://api.ppq.ai",
        api: "openai-completions",
        apiKey: "PPQ_API_KEY",
        models: models
    });
}

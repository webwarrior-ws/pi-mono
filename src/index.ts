import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionHandler, SessionStartEvent } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

interface CachedModels {
    lastUpdateTimestamp: number;
    models: Model<any>[];
}

const CACHE_FILE = join(getAgentDir(), "ppq-models-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function readCache(): CachedModels | null {
    try {
        if (existsSync(CACHE_FILE)) {
            const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as CachedModels;
            if (data.lastUpdateTimestamp && data.models?.length > 0) {
                return data;
            }
        }
    } catch (error) {
        console.error("Failed to read PPQ model cache:", error);
    }
    return null;
}

function writeCache(models: Model<any>[]): void {
    try {
        const dir = getAgentDir();
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        const data: CachedModels = {
            lastUpdateTimestamp: Date.now(),
            models,
        };
        writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
        console.error("Failed to write PPQ model cache:", error);
    }
}

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

export default async function (pi: ExtensionAPI) {
    const onSessionStart: ExtensionHandler<SessionStartEvent> = async (_event, ctx) => {
        const cache = readCache();
        const isFirstInstall = cache === null;
        const isCacheValid = cache !== null && cache.lastUpdateTimestamp > Date.now() - CACHE_TTL_MS;

        let models: Model<any>[];
        if (isCacheValid) {
            models = cache.models;
            console.log(`Using cached PPQ models (${models.length} models)`);
        } else {
            models = await fetchPPQModels();
            if (models.length > 0) {
                writeCache(models);
            } else if (cache) {
                // Fetch failed but we have stale cache — use it
                models = cache.models;
                console.log(`Fetch failed, using stale cache (${models.length} models)`);
            }
        }

        if (models.length === 0) {
            return;
        }

        pi.registerProvider("ppq", {
            baseUrl: "https://api.ppq.ai",
            api: "openai-completions",
            apiKey: "PPQ_API_KEY",
            models: models,
        });

        if (isFirstInstall) {
            const autoclawModel = ctx.modelRegistry.find("ppq", "autoclaw");
            if (autoclawModel) {
                await pi.setModel(autoclawModel);
            }
        }
    };

    pi.on("session_start", onSessionStart);
}

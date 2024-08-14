import { DataAPIClient } from "@datastax/astra-db-ts";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import "dotenv/config";
import OpenAI from "openai";
import sampleData from "./sample-data.json" with {type: "json"};

const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY!
})

const client = new DataAPIClient(process.env.ASTRA_DB_APPLICATION_TOKEN!)

const endpoint = process.env.ASTRA_DB_API_ENDPOINT;
if (!endpoint) {
    throw new Error("ASTRA_DB_API_ENDPOINT is not defined");
}

const db = client.db(endpoint, {
    namespace: process.env.ASTRA_DB_NAMESPACE
})


const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
});

// const createCollection = async () => {
//     try {
//         await db.createCollection("portfolio", {
//             vector: {
//                 dimension: 1536,
//             }
//         })
//     } catch (error) {
//         console.log("Collection Already Exists", error);
//     }
// }

const createCollectionIfNotExists = async () => {
    try {
        const collections = await db.listCollections();
        const collectionNames = collections.map(col => col.name);

        if (!collectionNames.includes("portfolio")) {
            await db.createCollection("portfolio", {
                vector: {
                    dimension: 1536,
                }
            });
            console.log("Collection created successfully");
        } else {
            console.log("Collection already exists");
        }
    } catch (error) {
        console.log("Error listing or creating collection", error);
    }
};

// const loadData = async () => {
//     const collection = await db.collection("portfolio")
//     for await (const { id, info, description } of sampleData) {
//         const chunks = await splitter.splitText(description);
//         let i = 0;
//         for await (const chunk of chunks) {
//             const { data } = await openai.embeddings.create({
//                 input: chunk,
//                 model: "text-embedding-3-small"
//             })

//             const res = await collection.insertOne({
//                 document_id: id,
//                 $vector: data[0]?.embedding,
//                 info,
//                 description: chunk
//             })

//             i++
//         }
//     }

//     console.log("data added");
// }

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// const loadData = async () => {
//     const collection = await db.collection("portfolio");
//     for await (const { id, info, description } of sampleData) {
//         const chunks = await splitter.splitText(description);
//         let i = 0;
//         for await (const chunk of chunks) {
//             let retryCount = 0;
//             let success = false;

//             while (!success && retryCount < 3) { // Reducing retries to 3
//                 try {
//                     const { data } = await openai.embeddings.create({
//                         input: chunk,
//                         model: "text-embedding-3-small"
//                     });

//                     await collection.insertOne({
//                         document_id: id,
//                         $vector: data[0]?.embedding,
//                         info,
//                         description: chunk
//                     });

//                     success = true;
//                     i++;
//                 } catch (error: any) {
//                     if (error.code === 'insufficient_quota') {
//                         retryCount++;
//                         const delay = Math.pow(2, retryCount) * 10000; // Increasing base delay to 10 seconds
//                         console.log(`Rate limit exceeded, retrying in ${delay} ms...`);
//                         await sleep(delay);
//                     } else {
//                         console.log("Error creating embeddings", error);
//                         break;
//                     }
//                 }
//             }

//             if (!success) {
//                 console.log(`Failed to process chunk for id ${id} after ${retryCount} retries`);
//                 console.log("Exiting due to insufficient quota. Please try again later.");
//                 process.exit(1); // Exiting the process
//             }
//         }
//     }

//     console.log("Data added");
// }

const loadData = async () => {
    try {
        const collection = await db.collection("portfolio");
        for (const { id, info, description } of sampleData) {
            const chunks = await splitter.splitText(description);
            for (const chunk of chunks) {
                let retryCount = 0;
                let success = false;

                while (!success && retryCount < 3) {
                    try {
                        const { data } = await openai.embeddings.create({
                            input: chunk,
                            model: "text-embedding-3-small"
                        });

                        await collection.insertOne({
                            document_id: id,
                            $vector: data[0]?.embedding,
                            info,
                            description: chunk
                        });

                        success = true;
                    } catch (error: any) {
                        if (error.code === 'insufficient_quota') {
                            retryCount++;
                            const delay = Math.pow(2, retryCount) * 10000; // Increasing base delay to 10 seconds
                            console.log(`Rate limit exceeded, retrying in ${delay} ms...`);
                            await sleep(delay);
                        } else {
                            console.log("Error creating embeddings", error);
                            break;
                        }
                    }
                }

                if (!success) {
                    console.log(`Failed to process chunk for id ${id} after ${retryCount} retries`);
                    console.log("Exiting due to insufficient quota. Please try again later.");
                    process.exit(1); // Exiting the process
                }
            }
        }

        console.log("Data added");
    } catch (error) {
        console.log("Error loading data", error);
    }
}

// createCollection().then(() => loadData())
createCollectionIfNotExists().then(() => loadData()).catch(console.error);

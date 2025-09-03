// routes/dataRoute.js
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import express from "express";
import os from 'os';

dotenv.config();

const router = express.Router();

const SAVE_ROOT = path.resolve(
  process.env.IMAGE_SAVE_PATH || path.join(process.cwd(), 'images')
);

// ---- Config ----
const BASE_URL = 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LOCAL_CSV_PATH = process.env.CSV_PATH || path.join(process.cwd(), 'data.csv'); // default like python: data.csv

// ---- OpenAI client ----
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// ---- Shared session for Containers endpoints ----
const SESSION = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "containers=v1",
  },
});

// ----------------- File Upload -----------------
export async function upload_file(filePath = LOCAL_CSV_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV not found at ${filePath}`);
  }
  const uploaded = await client.files.create({
    file: fs.createReadStream(filePath),
    purpose: "user_data",
  });
  return uploaded; // { id, ... }
}

// ----------------- Container Management -----------------
export async function create_container({ name, file_ids = [], expires_after } = {}) {
  const payload = { name };
  if (file_ids?.length) payload.file_ids = file_ids;
  if (expires_after) payload.expires_after = expires_after;

  const resp = await SESSION.post('/containers', payload);
  return resp.data; // { id, ... }
}

// Optional helper to check if a container is still valid (and touch it by using it soon after)
async function get_container(containerId) {
  // Minimal liveness check. If it fails (e.g., 404), caller will recreate.
  await SESSION.get(`/containers/${containerId}`);
  return containerId;
}

// ----------------- Responses -----------------
export async function createResponse(inputText, containerId) {
  /** Generate a response and return message text + container_id. */
  const result = { message: '', container_id: null };

  const response = await client.responses.create({
    model: 'gpt-4.1-nano',
    input: inputText,
    tools: [{ type: 'code_interpreter', container: containerId }], // bind to our persistent container
    instructions:
      'You are a professional data analyst. And data visualizer. ' +
      'Make professional looking graphs, easy to understand. ' +
      'Answer concisely and accurately. Focus on the numbers. ' +
      'Never give the links in your text response.',
  });

  const messageParts = [];
  for (const item of response.output || []) {
    if (item.type === 'code_interpreter_call') {
      result.container_id = item.container_id;
    } else if (item.type === 'message' && item.content?.length) {
      const first = item.content[0];
      if (first.type === 'output_text') {
        messageParts.push(first.text);
      }
    }
  }

  result.message = messageParts.join('');
  return result;
}

// ----------------- File Retrieval / Download -----------------
export async function retrieveContainerFiles(containerId) {
  /** Return assistant-created files in /mnt/data, deduped by sanitized filename. */
  const resp = await SESSION.get(`/containers/${containerId}/files`);
  const data = resp.data;

  const files = [];
  const seenNames = new Set();

  for (const f of data?.data || []) {
    const p = f?.path || '';
    if (!p.startsWith('/mnt/data')) continue;
    if ((f?.source || '').toLowerCase() !== 'assistant') continue;

    const basename = p.split('/').pop() || '';
    const cleaned = basename.replace(/[^a-zA-Z0-9._-]/g, '').trim().toLowerCase();
    const filename = cleaned || 'file';

    if (seenNames.has(filename)) continue;
    seenNames.add(filename);

    files.push({ id: f?.id || '', name: filename });
  }

  return { container_id: containerId, files };
}

export async function downloadContainerFile(containerFiles) {
  /** Download all container files to ./downloads (ephemeral). */
  const { container_id: containerId, files } = containerFiles;
  const downloadDir = path.join(process.cwd(), 'images');
  fs.mkdirSync(downloadDir, { recursive: true });

  const savedPaths = [];
  for (const f of files) {
    const { id: fileId, name: fileName } = f;

    const resp = await SESSION.get(
      `/containers/${containerId}/files/${fileId}/content`,
      { responseType: 'arraybuffer' }
    );
    if (resp.status !== 200) {
      throw new Error(
        `Failed to download file ${fileId} (status ${resp.status}): ${resp.data}`
      );
    }

    const filePath = path.join(downloadDir, fileName);
    fs.writeFileSync(filePath, resp.data);
    // Build public URL (adjust if your server runs on a different host/port)
    const publicUrl = `/images/${encodeURIComponent(fileName)}`;
    savedPaths.push(publicUrl);
  }

  return savedPaths;
}

// ----------------- Persistent Container (singleton) -----------------
let PERSIST = /** @type {null | { containerId: string, fileId: string }} */ (null);

/**
 * Create (once) and cache a container with the CSV attached.
 * Call this during server startup.
 */
export async function initPersistentContainer() {
  if (PERSIST) return PERSIST;

  // 1) Upload the CSV once
  const uploaded = await upload_file(LOCAL_CSV_PATH);

  // 2) Create a container bound to that file
  const container = await create_container({
    name: "Lupita WebApp Container",
    file_ids: [uploaded.id],
    // Keep it alive while it's being used; if it idles out, we'll recreate later:
    expires_after: { anchor: "last_active_at", minutes: 20 },
  });

  PERSIST = { containerId: container.id, fileId: uploaded.id };
  return PERSIST;
}

/**
 * Get a valid container ID. If missing or invalid (e.g., expired), recreate it.
 */
async function getContainerId() {
  if (PERSIST?.containerId) {
    try {
      await get_container(PERSIST.containerId);
      return PERSIST.containerId;
    } catch {
      // fall through to recreate
    }
  }
  // Recreate on demand
  PERSIST = null;
  const { containerId } = await initPersistentContainer();
  return containerId;
}

// ----------------- Analyzer (uses the persistent container) -----------------
export async function data_analyzer(userQuery) {
  const finalResult = { assistant_response: '', file_paths: null };

  // Use the persistent container instead of creating per request
  let containerId;
  try {
    containerId = await getContainerId();
  } catch (e) {
    finalResult.assistant_response = `Error ensuring container: ${e?.message || e}`;
    return finalResult;
  }

  // Generate response with that container
  const response = await createResponse(userQuery, containerId);
  const message = response.message || '';

  // If files were produced, list and download them
  if (containerId) {
    let containerFiles;
    try {
      containerFiles = await retrieveContainerFiles(containerId);
    } catch (e) {
      finalResult.assistant_response = `${message}. Unable to list files for processing.`;
      return finalResult;
    }

    const filesList = containerFiles.files || [];
    if (filesList.length > 0) {
      try {
        const savedFilePaths = await downloadContainerFile(containerFiles);
        finalResult.file_paths = savedFilePaths;
      } catch {
        finalResult.assistant_response = `${message}. An unexpected error occurred while creating the files. Please try again later.`;
        return finalResult;
      }
    }
  }

  finalResult.assistant_response = message;
  return finalResult;
}

// ---- Helper to normalize query input (unchanged) ----
function normalizeInput(input) {
  if (!input) return "";
  if (typeof input === "string") return input.trim();
  if (typeof input === "object" && !Array.isArray(input)) {
    return input.user_query?.trim() || input.name?.trim() || input.query?.trim() || "";
  }
  if (Array.isArray(input)) {
    for (const el of input) {
      const val = normalizeInput(el);
      if (val) return val;
    }
    return "";
  }
  return String(input).trim();
}

// ----------------- Route -----------------
router.post("/", async (req, res) => {
  try {
    const { query } = req.body ?? {};
    const normalized = normalizeInput(query);

    if (!normalized) {
      return res.status(400).json({
        error: "Body must include a non-empty 'query' string (or object with 'query'/'name'/'user_query').",
      });
    }

    const result = await data_analyzer(normalized);
    return res.json(result);
  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;

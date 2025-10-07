import axios from 'axios';
import express from "express";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { message, user } = req.body ?? {};

    const url = "https://brunoalfra.app.n8n.cloud/webhook-test/6a8109de-b6cc-4c2f-9e92-03986257c04a";
    const payload = { message, user };

    const n8nResponse = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
    });

    return res.json({
      success: true,
      //data: n8nResponse.data,
      data: n8nResponse.data?.[0]?.output || null,
    });

  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ error: err.message });
  }
});


export default router;

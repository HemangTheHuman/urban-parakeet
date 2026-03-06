require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebflowClient } = require("webflow-api");

const app = express();

// Enable CORS so the React app running on localhost:1337 or 3000 can call it
// In production on Vercel, the frontend and backend are on the same domain,
// but CORS is still good to have if you test locally.
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Endpoint to receive info from the frontend
app.post("/api/token", async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).send("No code provided");
  }

  try {
    // Request an access token using Webflow's Node SDK
    const accessToken = await WebflowClient.getAccessToken({
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      code: code,
      redirectUri: req.body.redirectUri // Pass the redirect URI from the frontend
    });

    // 1. Get Authorization User Info
    const userRes = await fetch("https://api.webflow.com/beta/token/authorized_by", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      },
    });
    const userData = await userRes.json();
    console.log("User data:", userData);
    const userId = userData.id;

    // 2. Fetch sites information instead of workspaces
    const sitesRes = await fetch("https://api.webflow.com/v2/sites", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept-Version": "2.0.0" // Ensure v2 version header is passed
      }
    });
    const sitesData = await sitesRes.json();
    console.log("Sites data:", sitesData);
    
    // Webflow v2 API returns sites inside a 'sites' array
    const sites = sitesData.sites || [];
    
    // Extract workspace ID from the first mapped site, since sites belong to a workspace
    const workspaceId = sites.length > 0 ? sites[0].workspaceId : null;

    if (!userId || !workspaceId) {
      console.warn("Could not retrieve userId or workspaceId.", { userId, workspaceId });
    }

    // We no longer store anything in the database because the frontend uses localStorage

    res.json({ 
      access_token: accessToken, 
      user_id: userId, 
      workspace_id: workspaceId 
    });
  } catch (error) {
    console.error("Error during OAuth process:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

// Endpoint to proxy sites request to avoid CORS
app.get("/api/sites", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header provided" });
  }

  try {
    const response = await fetch("https://api.webflow.com/v2/sites", {
      method: "GET",
      headers: {
        "Authorization": authHeader
      }
    });

    const data = await response.json();
    if (response.ok) {
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error("Error proxying sites request:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

// Endpoint to proxy specific site detail request
app.get("/api/sites/:siteId", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header provided" });
  }

  try {
    const response = await fetch(`https://api.webflow.com/v2/sites/${req.params.siteId}`, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
        "Accept-Version": "2.0.0"
      }
    });

    const data = await response.json();
    if (response.ok) {
      res.json(data);
      
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error(`Error proxying site details for ${req.params.siteId}:`, error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

// --- PROXY ENDPOINTS FOR STEP 3, 4, 5 ---

// Endpoint to fetch site custom code
app.get("/api/sites/:siteId/custom_code", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header provided" });
  }
  console.log("authHeader", authHeader  );
  try {
    const response = await fetch(`https://api.webflow.com/v2/sites/${req.params.siteId}/custom_code`, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
        "accept": "application/json"
      }
    });

    const data = await response.json();
    if (response.ok) {
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error(`Error proxying custom code GET for ${req.params.siteId}:`, error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

// Endpoint to fetch registered scripts
app.get("/api/sites/:siteId/registered_scripts", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header provided" });
  }
  
  try {
    const response = await fetch(`https://api.webflow.com/v2/sites/${req.params.siteId}/registered_scripts`, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
        "Accept-Version": "2.0.0"
      }
    });

    const data = await response.json();
    if (response.ok) {
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error(`Error proxying registered scripts GET for ${req.params.siteId}:`, error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

// Endpoint to register a new inline script
app.post("/api/sites/:siteId/registered_scripts/inline", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header provided" });
  }

  try {
    const response = await fetch(`https://api.webflow.com/v2/sites/${req.params.siteId}/registered_scripts/inline`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        "Accept-Version": "2.0.0"
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    if (response.ok) {
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error(`Error proxying inline script registration POST for ${req.params.siteId}:`, error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});


// Endpoint to update site custom code
app.put("/api/sites/:siteId/custom_code", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header provided" });
  }

  try {
    const response = await fetch(`https://api.webflow.com/v2/sites/${req.params.siteId}/custom_code`, {
      method: "PUT",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        "Accept-Version": "2.0.0"
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    if (response.ok) {
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error(`Error proxying custom code PUT for ${req.params.siteId}:`, error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

// Endpoint to proxy MultiLipi verification
app.get("/api/verify", async (req, res) => {
  const { key, origin, path, url, mode, timezone } = req.query;
  
  if (!key) {
    return res.status(400).json({ error: "Verification key is required" });
  }

  try {
    // Construct the query string dynamically
    const queryParams = new URLSearchParams({
      key,
      origin: origin || "",
      path: path || "/",
      url: url || "",
      mode: mode || "auto",
      timezone: timezone || "UTC"
    });

    const externalUrl = `https://multilipiseo-2.multilipi.com/domain/plugin_key_verify?${queryParams.toString()}`;
    console.log("--- [PROXY] Calling Verification API:", externalUrl);

    const response = await fetch(externalUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    // Check if response is okay before parsing JSON (in case it returns non-JSON error)
    if (!response.ok) {
       console.error("--- [PROXY] Verification API returned error status:", response.status);
       const errorText = await response.text();
       return res.status(response.status).json({ error: "Downstream verification failed", details: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(`Error proxying MultiLipi verification:`, error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

// Instead of app.listen, we export the app for Vercel
module.exports = app;

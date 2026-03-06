require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebflowClient } = require("webflow-api");

// Initialize database connection
const db = require("./database");

const app = express();
const port = 3001; // Running on 3001 to avoid conflicting with the Webpack dev server on 3000

// Enable CORS so the React app running on localhost:1337 or 3000 can call it
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

    if (userId && workspaceId) {
      // 3. Store User in database
      const userQuery = `
        INSERT INTO users (user_id, bearer_token, workspace_id) 
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          bearer_token = excluded.bearer_token,
          workspace_id = excluded.workspace_id
      `;
      db.run(userQuery, [userId, accessToken, workspaceId], (err) => {
        if (err) {
          console.error("Error storing user details in database:", err.message);
        } else {
          console.log(`Stored user ${userId} with their token and workspace successfully.`);
        }
      });

      // 4. Loop through and store all sites associated with the user/workspace
      const siteQuery = `
        INSERT INTO sites (site_id, user_id, workspace_id, project_key, domain)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(site_id) DO UPDATE SET
          user_id = excluded.user_id,
          workspace_id = excluded.workspace_id,
          domain = excluded.domain
          -- We do not overwrite project_key if already set somewhere else
      `;
      
      const insertSiteProcess = db.prepare(siteQuery);
      
      sites.forEach(site => {
         // Some domains could be nested depending on if custom domains are returned, 
         // but for v2/sites it returns `customDomains` as an array.
         // We'll store the primary shortName or customDomain if it exists as 'domain'
         const domainStr = site.customDomains && site.customDomains.length > 0 
            ? site.customDomains[0].url 
            : site.shortName + ".webflow.io";
            
         // Execute query to insert or update site
         // Leaving project_key as NULL for now
         insertSiteProcess.run([site.id, userId, site.workspaceId, null, domainStr], (err) => {
             if (err) {
                 console.error(`Error saving site ${site.id}:`, err.message);
             } else {
                 console.log(`Saved site ${site.id} successfully.`);
             }
         });
      });
      
      insertSiteProcess.finalize();
      
    } else {
      console.warn("Could not retrieve userId or workspaceId. Token not saved to DB.", { userId, workspaceId });
    }

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

// --- NEW PROXY ENDPOINTS FOR STEP 3, 4, 5 ---

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

// Endpoint to resolve idToken and retrieve stored token from the DB
app.post("/api/identify", async (req, res) => {
  console.log("--- [IDENTIFY USER] Starting identification flow ---");
  const { idToken } = req.body;

  if (!idToken) {
    console.warn("--- [IDENTIFY USER] Failed: No idToken provided in request body.");
    return res.status(400).send("No idToken provided");
  }

  try {
    console.log("--- [IDENTIFY USER] Step 1: Resolving Webflow idToken via beta API...");
    const resolveRes = await fetch("https://api.webflow.com/beta/token/resolve", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.CLIENT_TOKEN}`,
        "Content-Type": "application/json"
      },  
      body: JSON.stringify({ idToken })
    });

    const resolvedData = await resolveRes.json();
    console.log("--- [IDENTIFY USER] Step 1 Complete! Webflow response:", resolvedData);

    if (!resolveRes.ok || !resolvedData.id) {
       console.error("--- [IDENTIFY USER] Failed to resolve user from Webflow:", resolvedData);
       return res.status(401).json({ error: "Invalid or expired idToken", details: resolvedData });
    }

    const userId = resolvedData.id;
    console.log(`--- [IDENTIFY USER] Step 2: Resolved User ID is '${userId}'. Looking up user in local SQLite DB...`);

    // 2. Query the database to retrieve the actual bearer_token tied to this user
    db.get("SELECT * FROM users WHERE user_id = ?", [userId], (err, row) => {
      if (err) {
        console.error("--- [IDENTIFY USER] DB Error while looking up user:", err.message);
        return res.status(500).json({ error: "Database lookup failed", details: err.message });
      }

      if (!row || !row.bearer_token) {
        console.log(`--- [IDENTIFY USER] Failure: No matching user or token discovered for ID '${userId}'. They must authorize manually.`);
        return res.status(404).json({ error: "User securely identified but no token was found. Please authorize." });
      }

      console.log(`--- [IDENTIFY USER] Step 3 Success: Token match found in DB for user '${userId}'!`);
      // Return the cached details mimicking the original token exchange process
      res.json({
        user_id: row.user_id,
        workspace_id: row.workspace_id,
        access_token: row.bearer_token, // We securely send it down to the client so the frontend can function
        user_info: resolvedData
      });
      console.log("--- [IDENTIFY USER] Identification flow fulfilled and dispatched back to client! ---");
    });

  } catch (error) {
    console.error("--- [IDENTIFY USER] Fatal Error occurred during flow execution:", error);
    res.status(500).json({ error: "Internal identification error", details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Webflow OAuth proxy server is running at http://localhost:${port}`);
});

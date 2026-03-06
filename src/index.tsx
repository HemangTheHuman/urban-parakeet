import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const REDIRECT_URI = "https://proacting-gargety-theodore.ngrok-free.dev/index.html";

const App: React.FC = () => {
  const [code, setCode] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<string>("Initializing...");
  const [sites, setSites] = useState<any[]>([]);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  
  // Site State Maps
  const [siteDetails, setSiteDetails] = useState<Record<string, any>>({});
  const [siteDetailsLoading, setSiteDetailsLoading] = useState<Record<string, boolean>>({});
  const [siteCodeStatus, setSiteCodeStatus] = useState<Record<string, 'loading' | 'connected' | 'unconnected'>>({});
  const [siteKeys, setSiteKeys] = useState<Record<string, string>>({});
  const [targetLanguages, setTargetLanguages] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const initializeApp = async () => {
      const path = window.location.pathname;
      const urlParams = new URLSearchParams(window.location.search);
      const codeParam = urlParams.get("code");

      // CASE 1: Fresh Install Flow - Routing to root with code
      if (codeParam) {
        setCode(codeParam);
        await exchangeCodeForToken(codeParam);
        return;
      }

      // CASE 2: Returning User Flow - Checking root path without code
      if (path === "/" || path === "/index.html") {
        const storedToken = localStorage.getItem("webflow_token");
        if (storedToken) {
          const success = await fetchSites(storedToken);
          if (!success) {
            triggerOAuthRedirect();
          }
        } else {
          triggerOAuthRedirect();
        }
      }
    };

    initializeApp();
  }, []);

  const triggerOAuthRedirect = () => {
    setAuthStatus("Redirecting to Webflow for Authorization...");
    const clientId = process.env.CLIENT_ID;
    if (!clientId) {
      setAuthStatus("Error: NEXT_PUBLIC_CLIENT_ID or CLIENT_ID is missing in environment.");
      return;
    }
    const authUrl = `https://webflow.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=authorized_user%3Aread+custom_code%3Aread+custom_code%3Awrite+sites%3Aread+users%3Aread+workspace%3Aread`;
    window.location.href = authUrl;
  };

  const exchangeCodeForToken = async (authCode: string) => {
    try {
      setAuthStatus("Exchanging authorization code...");
      const response = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode }),
      });

      const data = await response.json();
      if (response.ok && data.access_token) {
        setAuthStatus("Authorization successful! Loading your dashboard...");
        localStorage.setItem("webflow_token", data.access_token);
        setTimeout(() => {
          window.location.href = "/";
        }, 1500);
      } else {
        setAuthStatus(`Failed to get token: ${data.err || data.error || response.statusText}`);
      }
    } catch (error) {
      setAuthStatus(`Request failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const fetchSites = async (token: string): Promise<boolean> => {
    try {
      setAuthStatus("Fetching your sites...");
      const response = await fetch("/api/sites", {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (response.status === 401) {
        localStorage.removeItem("webflow_token");
        return false;
      }

      const body = await response.json();
      if (response.ok) {
        setSites(body.sites || []);
        setAuthStatus("");
        return true;
      }
      setAuthStatus(`Failed to load sites: ${body.message || response.statusText}`);
      return false;
    } catch (err) {
      setAuthStatus("Network error occurred while fetching sites.");
      return false;
    }
  };

  // MULTILIPI SCRIPT STRING
  const MULTILIPI_SCRIPT_NAME = "MULTILIPI";
  const generateScriptBody = (projectKey: string) => {
      return `
var script = document.createElement('script');
script.src = "https://script-cdn.multilipi.com/static/JS/page_translations.js";
script.setAttribute('multilipi-key', "${projectKey}");
script.setAttribute('mode', "auto");
script.setAttribute('data-pos-x', "50");
script.setAttribute('data-pos-y', "50");
script.setAttribute('crossorigin', "anonymous");
script.defer = true;
document.head.appendChild(script);
`;
  };

  // Matches either: multilipi-key="XYZ" or 'multilipi-key', "XYZ"
  const SCRIPT_REGEX = /multilipi-key['"]\s*(?:=>|=|,\s*)?\s*['"]([^'"]+)['"]/i;

  const fetchSiteDetailsAndCode = async (siteId: string) => {
    console.log("fetchSiteDetailsAndCode called for:", siteId);
    if (expandedSiteId === siteId) {
      console.log("Collapsing site:", siteId);
      setExpandedSiteId(null);
      return;
    }
    setExpandedSiteId(siteId);

    if (siteDetails[siteId] && siteCodeStatus[siteId]) {
      console.log("Data already cached for site:", siteId, "returning early.");
      return;
    }

    const token = localStorage.getItem("webflow_token");
    if (!token) {
      console.log("No token found, returning early.");
      return;
    }

    setSiteDetailsLoading(prev => ({ ...prev, [siteId]: true }));
    setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'loading' }));

    try {
      console.log("Fetching details from API...");
      // 1. Fetch Details
      const detailsRes = await fetch(`/api/sites/${siteId}`, {
         headers: { "Authorization": `Bearer ${token}` }
      });
      console.log("Details API responded with status:", detailsRes.status);
      const siteData = await detailsRes.json();
      console.log("Details response (parsed):", siteData);
      let finalDetails = siteData;
      if (detailsRes.ok) {
        setSiteDetails(prev => ({ ...prev, [siteId]: siteData }));
      } else {
        console.warn("Failed to fetch site details. Using basic site info as fallback.");
        const fallbackSite = sites.find(s => s.id === siteId);
        finalDetails = fallbackSite || {};
        setSiteDetails(prev => ({ ...prev, [siteId]: fallbackSite || {} }));
      }

      // 2. Fetch Registered Scripts first (Step 3)
      const registeredScriptsRes = await fetch(`/api/sites/${siteId}/registered_scripts`, {
         headers: { "Authorization": `Bearer ${token}` }
      });

      if (registeredScriptsRes.ok) {
         const scriptsData = await registeredScriptsRes.json();
         const registeredScripts = scriptsData.registeredScripts || [];
         
         const multilipiScripts = registeredScripts.filter((s: any) => s.displayName === MULTILIPI_SCRIPT_NAME);
         // Sort by createdOn descending to get the latest script version
         multilipiScripts.sort((a: any, b: any) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());
         const multilipiScript = multilipiScripts[0];
         console.log("Found multilipiScripts array:", multilipiScripts);
         console.log("Latest multilipiScript:", multilipiScript);

         if (multilipiScript) {
             // Case 2: Found Script
             try {
                console.log(`Fetching script content from: ${multilipiScript.hostedLocation}`);
                // Fetch the actual script source to extract the key
                const scriptContentRes = await fetch(multilipiScript.hostedLocation);
                if (scriptContentRes.ok) {
                    const scriptText = await scriptContentRes.text();
                    console.log(`Raw script text block:`, scriptText);
                    
                    const match = scriptText.match(SCRIPT_REGEX);
                    console.log(`Regex Match Result:`, match);
                    
                    if (match && match[1]) {
                        const extractedKey = match[1];
                        console.log(`Extracted Project Key successfully: ${extractedKey}`);
                        setSiteKeys(prev => ({ ...prev, [siteId]: extractedKey }));
                        setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'connected' }));
                        // Start Verification automatically
                        verifyKey(extractedKey, siteId, finalDetails);
                    } else {
                        console.warn("Regex failed to find key in script text.");
                        setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
                    }
                } else {
                   console.error(`Failed to fetch script content. Status: ${scriptContentRes.status}`);
                   setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
                }
             } catch (e) {
                console.error("Error fetching script content for key extraction", e);
                setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
             }
         } else {
             // Case 1: No Script
             console.log("No valid/applied MultiLipi script found, setting to unconnected");
             setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
         }
      } else {
          console.error(`Failed to fetch registered scripts (${registeredScriptsRes.status}), setting to unconnected`);
          setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
      }

    } catch (err) {
      console.error("Error fetching site details/code", err);
      setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
    } finally {
      setSiteDetailsLoading(prev => ({ ...prev, [siteId]: false }));
    }
  };

  const getSiteDomainAndLang = (siteData: any) => {
    if (!siteData) return { domain: "", primaryLocale: "" };
    const domain = siteData.customDomains && siteData.customDomains.length > 0 
      ? siteData.customDomains[0].url 
      : `${siteData.shortName}.webflow.io`;
    const primaryLocale = siteData.locales?.primary?.displayName 
        || siteData.locales?.primary?.tag 
        || "English (Default)";
    return { domain, primaryLocale };
  };

  // Step 4: Verification API
  const verifyKey = async (key: string, siteId: string, siteData?: any) => {
     try {
       const detail = siteData || siteDetails[siteId];
       const { domain } = getSiteDomainAndLang(detail);
       // Timezone simple extraction
       const tmz = Intl.DateTimeFormat().resolvedOptions().timeZone;

       const res = await fetch(`/api/verify?key=${key}&origin=${domain}&url=${domain}&path=/&mode=auto&timezone=${tmz}`);
       
       if (res.ok) {
          const data = await res.json();
          // Assume data returns target languages in an array or object format. 
          // Customizing based on typical responses -> if { target_languages: ["es", "fr"] }
          const langs = data.languages || data.targets || [];
          setTargetLanguages(prev => ({...prev, [siteId]: langs }));
          return true;
       } else {
          console.error("Verification failed");
          return false;
       }
     } catch (e) {
        console.error("Verify API Error", e);
        return false;
     }
  };

  // Step 4: Handle Connect
  const handleConnect = async (siteId: string) => {
      const key = siteKeys[siteId];
      if (!key) return alert("Please enter a project key");

      const token = localStorage.getItem("webflow_token");
      if (!token) return;
      
      setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'loading' }));

      try {
        // 1. Verify key and get languages BEFORE embedding the script
        const isVerified = await verifyKey(key, siteId);
        if (!isVerified) {
            alert("Verification failed. Please check your Project Key and try again.");
            setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
            return;
        }

        // 2. Register Inline Script
        const sourceCode = generateScriptBody(key);
        // Using a basic hash for versioning based on key so we can update it if key changes
        const version = "1.0." + Math.floor(Math.random() * 10000); 

        const registerRes = await fetch(`/api/sites/${siteId}/registered_scripts/inline`, {
             method: "POST",
             headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
             },
             body: JSON.stringify({
                 sourceCode,
                 version,
                 displayName: MULTILIPI_SCRIPT_NAME
             })
        });

        if (!registerRes.ok) {
            console.error("Failed to register script inline", await registerRes.text());
            alert("Failed to register MultiLipi script with Webflow.");
            setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
            return;
        }

        const registeredData = await registerRes.json();
        const scriptId = registeredData.id;

        // 3. Fetch current custom code to append to it safely
        const codeRes = await fetch(`/api/sites/${siteId}/custom_code`, {
           headers: { "Authorization": `Bearer ${token}` }
        });
        
        let existingScripts: any[] = [];

        if (codeRes.ok) {
           const currentData = await codeRes.json();
           // In Webflow v2, scripts is an array according to the docs snapshot provided
           existingScripts = currentData.scripts || [];
        } else {
           console.warn("Could not fetch existing custom code, proceeding with empty base");
        }

        // Filter out any older multilipi scripts if replacing
        existingScripts = existingScripts.filter((s: any) => s.id !== scriptId);
        
        existingScripts.push({
            id: scriptId,
            location: "header",
            version: version
        });

        const putRes = await fetch(`/api/sites/${siteId}/custom_code`, {
            method: "PUT",
            headers: {
               "Authorization": `Bearer ${token}`,
               "Content-Type": "application/json"
            },
            body: JSON.stringify({
                scripts: existingScripts
            })
        });

        if (putRes.ok) {
            setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'connected' }));
        } else {
            alert("Failed to apply Custom Code configuration");
            setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
        }
      } catch (err) {
         console.error(err);
         setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
      }
  };

  // Step 5: Handle Disconnect
  const handleDisconnect = async (siteId: string) => {
      const token = localStorage.getItem("webflow_token");
      if (!token) return;
      
      setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'loading' }));

      try {
        // 1. Get current registered scripts to find the MultiLipi one
        const registeredScriptsRes = await fetch(`/api/sites/${siteId}/registered_scripts`, {
           headers: { "Authorization": `Bearer ${token}` }
        });

        let scriptIdToRemove = null;
        if (registeredScriptsRes.ok) {
            const scriptsData = await registeredScriptsRes.json();
            const registeredScripts = scriptsData.registeredScripts || [];
            const multilipiScript = registeredScripts.find((s: any) => s.displayName === MULTILIPI_SCRIPT_NAME);
            if (multilipiScript) {
                scriptIdToRemove = multilipiScript.id;
            }
        }

        if (!scriptIdToRemove) {
             console.warn("MultiLipi script not found in registered scripts. Nothing to disconnect.");
             setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
             setSiteKeys(prev => ({ ...prev, [siteId]: '' }));
             setTargetLanguages(prev => ({...prev, [siteId]: [] })); // Clear targets
             return;
        }

        // 2. Remove from Custom Code
        const codeRes = await fetch(`/api/sites/${siteId}/custom_code`, {
           headers: { "Authorization": `Bearer ${token}` }
        });
        
        let existingScripts: any[] = [];

        if (codeRes.ok) {
           const currentData = await codeRes.json();
           existingScripts = currentData.scripts || [];
        } else {
           console.warn("Could not fetch existing custom code during disconnect.");
        }

        const filteredScripts = existingScripts.filter((s: any) => s.id !== scriptIdToRemove);

        const putRes = await fetch(`/api/sites/${siteId}/custom_code`, {
            method: "PUT",
            headers: {
               "Authorization": `Bearer ${token}`,
               "Content-Type": "application/json"
            },
            body: JSON.stringify({
                scripts: filteredScripts
            })
        });

        if (putRes.ok) {
            setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'unconnected' }));
            setSiteKeys(prev => ({ ...prev, [siteId]: '' }));
            setTargetLanguages(prev => ({...prev, [siteId]: [] })); // Clear targets
        } else {
            alert("Failed to remove Custom Code");
            setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'connected' }));
        }
      } catch (err) {
         console.error(err);
         setSiteCodeStatus(prev => ({ ...prev, [siteId]: 'connected' }));
      }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>MultiLipi</h1>
        <p>Your streamlined Webflow localization dashboard.</p>
        {authStatus && <div className="status"><span className="status-dot"></span>{authStatus}</div>}
      </div>

      {code && authStatus.includes("Exchanging") && (
        <div className="loading-container" style={{textAlign: 'center', marginTop: '40px'}}>
           <div className="loading-spinner"></div>
           <p style={{color: '#94a3b8', marginTop: '16px'}}>Finalizing secure authentication...</p>
        </div>
      )}
      
      {sites.length > 0 && !code && (
        <div className="sites-section fade-in">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
              <h2 style={{fontSize: '1.2rem', margin: 0}}>Available Sites</h2>
              <span className="tag tag-blue">{sites.length} found</span>
          </div>

          {sites.map((site) => (
            <div 
              className={`site-tile ${expandedSiteId === site.id ? 'expanded' : ''}`}
              key={site.id}
            >
              <div 
                className="site-header-content" 
                style={{cursor: 'pointer'}}
                onClick={() => fetchSiteDetailsAndCode(site.id)}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div>
                        <h3>{site.displayName}</h3>
                        <p>{site.shortName}</p>
                    </div>
                    <svg className={`chevron ${expandedSiteId === site.id ? 'rotate' : ''}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: '#a1a1aa', transition: 'transform 0.3s ease'}}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
              </div>
              
              <div className={`site-details-panel ${expandedSiteId === site.id ? 'open' : ''}`}>
                  {siteDetailsLoading[site.id] || siteCodeStatus[site.id] === 'loading' ? (
                    <div className="loading-container" style={{marginTop: '20px'}}>
                      <div className="loading-spinner" style={{width: '24px', height: '24px', borderTopColor: '#3b82f6'}}></div>
                      <p style={{color: '#a1a1aa', fontSize: '0.9rem', marginTop: '12px'}}>
                         {siteCodeStatus[site.id] === 'loading' ? 'Syncing to Webflow...' : 'Fetching live configuration...'}
                      </p>
                    </div>
                  ) : siteDetails[site.id] ? (
                    (() => {
                        const { domain, primaryLocale } = getSiteDomainAndLang(siteDetails[site.id]);
                        const isConnected = siteCodeStatus[site.id] === 'connected';
                        const langs = targetLanguages[site.id] || [];

                        return (
                            <div className="inner-card">
                                <div className="status" style={{color: isConnected ? '#10b981' : '#f59e0b', background: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', padding: '6px 12px', borderRadius: '20px', display: 'inline-flex', fontSize: '0.8rem'}}>
                                    <span className="status-dot" style={{backgroundColor: isConnected ? '#10b981' : '#f59e0b'}}></span>
                                    {isConnected ? 'Script Active' : 'Not Connected'}
                                </div>

                                <span className="label-title">Hosted Domain</span>
                                <div style={{color: '#fff', fontSize: '0.95rem', background: '#000', padding: '10px 14px', borderRadius: '6px', border: '1px solid #27272a', fontFamily: 'monospace', margin: '8px 0 20px 0', wordBreak: 'break-all'}}>
                                    {domain}
                                </div>

                                <span className="label-title">Original Source Language</span>
                                <div className="tag-row">
                                    <span className="tag tag-blue">{primaryLocale}</span>
                                </div>

                                {isConnected ? (
                                    <>
                                        <span className="label-title">TARGET LANGUAGES</span>
                                        <div className="tag-row">
                                            {langs.length > 0 ? (
                                                langs.map((l, i) => <span key={i} className="tag tag-gray">{l}</span>)
                                            ) : (
                                                <span className="tag tag-gray">Waiting for Translation...</span>
                                            )}
                                        </div>
                                        
                                        <div style={{display: 'flex', gap: '8px', marginTop: '24px'}}>
                                            <button className="dashboard-btn" style={{flex: 1, padding: '10px', fontSize: '0.9rem'}} onClick={() => window.open(`http://${domain}`, '_blank')}>
                                                Preview Site
                                            </button>
                                            <button className="action-btn" style={{flex: 1, marginTop: '0', padding: '10px', fontSize: '0.9rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)'}} onClick={() => handleDisconnect(site.id)}>
                                                Disconnect Script
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{marginTop: '24px', borderTop: '1px solid var(--card-border)', paddingTop: '20px'}}>
                                        <p style={{fontSize: '0.9rem', color: '#a1a1aa', marginBottom: '12px'}}>Connect MultiLipi to this site by entering your Project Key.</p>
                                        <input 
                                            type="text" 
                                            placeholder="Enter Project Key..." 
                                            value={siteKeys[site.id] || ''} 
                                            onChange={(e) => setSiteKeys(prev => ({...prev, [site.id]: e.target.value}))}
                                            style={{width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '6px', border: '1px solid #27272a', background: '#000', color: '#fff', marginBottom: '12px', fontSize: '0.95rem'}}
                                        />
                                        <button className="dashboard-btn" style={{background: '#3b82f6', color: '#fff'}} onClick={() => handleConnect(site.id)}>
                                            Connect MultiLipi
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })()
                  ) : null}
              </div>
            </div>
          ))}

          <div className="footer">
            <p>Ready to upgrade your workflow?</p>
            <a href="https://multilipi.com" target="_blank" rel="noreferrer" className="dashboard-btn">
              Open MultiLipi Hub
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(<App />);

"use client";

import { useEffect } from "react";

export function DnsRedirect() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      // If the user accessed via the raw IP (10.42.0.1), check if we can redirect to a local domain
      if (hostname === "10.42.0.1") {
        const port = window.location.port ? `:${window.location.port}` : "";
        
        // Domains to test, ordered by reliability & descriptiveness
        const candidates = ["radpi.lan", "radpi.wifi", "radpi.local"];
        
        console.log("Checking local domains for seamless hostname upgrade:", candidates);
        
        let redirected = false;
        
        candidates.forEach((domain) => {
          const targetUrl = `http://${domain}${port}/api/healthz`;
          
          // Mode 'no-cors' allows us to ping the server offline. If DNS resolves, fetch succeeds.
          fetch(targetUrl, { mode: "no-cors", cache: "no-store" })
            .then(() => {
              if (!redirected) {
                redirected = true;
                const newUrl = `http://${domain}${port}${window.location.pathname}${window.location.search}${window.location.hash}`;
                console.log(`[DNS] ${domain} resolved successfully! Upgrading session to: ${newUrl}`);
                window.location.replace(newUrl);
              }
            })
            .catch(() => {
              console.log(`[DNS] ${domain} is not resolvable yet on this client device.`);
            });
        });
      }
    }
  }, []);

  return null;
}

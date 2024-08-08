import lighthouse from "lighthouse";
import puppeteer from "puppeteer";
import path from "path";
import chokidar from "chokidar";

import { writeFileSync, readFileSync } from "fs";
import { Server as SocketIOServer } from "socket.io";

const getWebVitals = (audits: Record<string, Record<string, number>>) => {
  const coreWebVitals = {
    FCP: audits["first-contentful-paint"].numericValue,
    LCP: audits["largest-contentful-paint"].numericValue,
    CLS: audits["cumulative-layout-shift"].numericValue,
    TBT: audits["total-blocking-time"].numericValue,
    TTI: audits["interactive"].numericValue,
    SI: audits["speed-index"].numericValue,
  };
  return coreWebVitals;
};

const formatNumber = (num: number, decimals: number = 2, skip = false) => {
  if (skip) return num.toFixed(decimals);
  return (num / 1000).toFixed(decimals);
};

const makeReportBeautiful = (coreWebVitals: Record<string, number>) => {
  return {
    FCP: `${formatNumber(coreWebVitals.FCP)}`,
    LCP: `${formatNumber(coreWebVitals.LCP)}`,
    CLS: `${formatNumber(coreWebVitals.CLS, 4, true)}`,
    TBT: `${formatNumber(coreWebVitals.TBT)}`,
    TTI: `${formatNumber(coreWebVitals.TTI)}`,
    SI: `${formatNumber(coreWebVitals.SI)}`,
  };
};

export default function myPlugin() {
  return {
    name: "plite",

    configureServer(server) {
      const io = new SocketIOServer(server.httpServer);
      const watcher = chokidar.watch("src/**/*.{js,ts,jsx,tsx}", {
        ignored: /node_modules/,
        persistent: true,
      });

      watcher.on("change", async (path) => {
        const address = server.httpServer.address();
        const url = `http://localhost:${address.port}`;
        try {
          const browser = await puppeteer.launch({ headless: true });
          const { lhr } = await lighthouse(url, {
            port: new URL(browser.wsEndpoint()).port,
            output: "html",
          });

          const coreWebVitals = getWebVitals(lhr.audits);
          const beautifulReport = makeReportBeautiful(coreWebVitals);

          io.emit("lighthouseReport", beautifulReport);

          if (lhr.report) {
            writeFileSync("lighthouse-report.html", lhr.report);
          }

          await browser.close();
        } catch (error) {
          console.error("Lighthouse error:", error);
        }
      });

      server.middlewares.use((req, res, next) => {
        next();
      });

      server.httpServer.on("close", () => {
        watcher.close();
        io.close();
      });
    },

    transformIndexHtml(html: string) {
      const scriptPath = path.resolve(__dirname, "index.html");
      const scriptContent = readFileSync(scriptPath, "utf-8");
      return html.replace("</body>", `${scriptContent}</body>`);
    },
  };
}

import http from "node:http";

const routes = [
  "/",
  "/auth",
  "/staff",
  "/staff/contracts",
  "/staff/transfer",
  "/leaves",
  "/payroll",
  "/payroll/bank-file",
  "/loans",
  "/approval-requests",
  "/settings",
  "/settings/branches",
  "/settings/company",
  "/reports/basic-data",
  "/reports/attendance",
  "/regulations/shifts",
  "/shifts/rosters"
];

async function checkRoute(path) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:3000${path}`, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          path,
          statusCode: res.statusCode,
          contentType: res.headers["content-type"] || "unknown",
          contentLength: data.length,
          hasTitle: data.includes("<title>") || data.includes("<!DOCTYPE html>") || data.includes("<html"),
        });
      });
    });

    req.on("error", (err) => {
      resolve({
        path,
        error: err.message,
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({
        path,
        error: "Timeout after 5000ms",
      });
    });
  });
}

console.log("Probing application browser routes on http://localhost:3000...\n");
const results = [];
for (const r of routes) {
  const res = await checkRoute(r);
  results.push(res);
}

console.table(results);

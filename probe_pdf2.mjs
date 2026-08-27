const url = "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Yesus-Kristus.pdf";
const opts = { method: "OPTIONS", headers: { "Origin": "https://gyspnk.github.io", "Access-Control-Request-Method": "GET" } };
const res = await fetch(url, opts).catch((e) => e);
console.log("OPTIONS:", res instanceof Error ? res.message : res.status, "ACAO:", res instanceof Error ? "-" : res.headers.get("access-control-allow-origin"));
const res2 = await fetch(url, { headers: { "Origin": "https://gyspnk.github.io" }, redirect: "follow" }).catch((e) => e);
console.log("GET+Origin:", res2 instanceof Error ? res2.message : res2.status, "ACAO:", res2 instanceof Error ? "-" : res2.headers.get("access-control-allow-origin"));
console.log(typeof Blob);

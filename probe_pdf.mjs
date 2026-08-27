const urls = [
  "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Yesus-Kristus.pdf",
  "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Hari-Sabat.pdf",
  "https://tjc.org/id/wp-content/uploads/sites/43/2019/10/Kedatangan-Kristus.pdf",
];
for (const url of urls) {
  try {
    const res = await fetch(url, { method: "HEAD" }).catch((e) => e);
    if (res instanceof Error) {
      console.log(url, "ERR", res.message);
      continue;
    }
    console.log(
      url,
      res.status,
      res.headers.get("content-type"),
      "| ACAO:",
      res.headers.get("access-control-allow-origin"),
      "| len",
      res.headers.get("content-length"),
    );
    res.body?.cancel();
  } catch (e) {
    console.log(url, "EXC", String(e));
  }
}

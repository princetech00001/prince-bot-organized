import axios from "axios";

export default {
  command: ["earthquake", "apod", "nasaimage", "npmwatch", "pypiwatch"],

  async run({ sock, msg, from, body, cmd }) {
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const query = body.trim().split(" ").slice(1).join(" ").trim();

    try {
      if (cmd === "earthquake") {
        const { data } = await axios.get(
          "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
          { timeout: 12000 }
        );
        const rows = (data.features || []).slice(0, 5)
          .map(f => `• M${f.properties?.mag ?? "?"} — ${f.properties?.place || "unknown"}`)
          .join("\n");
        return reply(`🌍 *Latest earthquakes (last 24h)*\n${rows || "No recent events."}`);
      }

      if (cmd === "apod" || cmd === "nasaimage") {
        const { data } = await axios.get("https://api.nasa.gov/planetary/apod", {
          params: { api_key: "DEMO_KEY" }, timeout: 12000
        });
        await sock.sendMessage(from, {
          image: { url: data.url },
          caption: `🚀 *${data.title || "NASA Picture of the Day"}*\n\n${(data.explanation || "").slice(0, 500)}`
        }, { quoted: msg });
        return;
      }

      if (cmd === "npmwatch") {
        if (!query) return reply("Usage: .npmwatch <package name>");
        const { data } = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(query)}`, { timeout: 12000 });
        return reply(
          `📦 *npm: ${data.name}*\n` +
          `Latest: ${data["dist-tags"]?.latest || "?"}\n` +
          `${(data.description || "No description").slice(0, 200)}\n` +
          `${data.repository?.url || ""}`
        );
      }

      if (cmd === "pypiwatch") {
        if (!query) return reply("Usage: .pypiwatch <package name>");
        const { data } = await axios.get(`https://pypi.org/pypi/${encodeURIComponent(query)}/json`, { timeout: 12000 });
        return reply(
          `🐍 *PyPI: ${data.info?.name}*\n` +
          `Version: ${data.info?.version || "?"}\n` +
          `${(data.info?.summary || "No summary").slice(0, 200)}\n` +
          `${data.info?.project_url || ""}`
        );
      }
    } catch (e) {
      return reply(`⚠️ Could not fetch that right now (${e.message}).`);
    }
  }
};

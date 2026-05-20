const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("localAiDj", {
  platform: process.platform,
  desktop: true
});

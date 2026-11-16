import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("erp", { platform: process.platform });

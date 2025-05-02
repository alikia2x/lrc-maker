const languages = import.meta.glob<Language>("./*.json", { as: "json", import: "default" });

export { languages };

export type Language = typeof import("./en-US.json");

export const langCodeList = ["en-US","ja","ko-KR","pl-PL","pt-BR","sk-SK","zh-CN","zh-HK","zh-TW"];
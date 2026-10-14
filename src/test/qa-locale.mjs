import { english } from "../i18n/messages.ts";
import { chinese } from "../i18n/zh-CN.ts";

export function localizedPage(page, locale) {
  function text(value) {
    if (locale === "en" || typeof value !== "string") return value;
    for (const [key, template] of Object.entries(english)) {
      if (template === value) return chinese[key];
      const names = [];
      const pattern = template
        .split(/(\{\w+\})/)
        .map((part) => {
          if (/^\{\w+\}$/.test(part)) {
            names.push(part.slice(1, -1));
            return "(.+)";
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("");
      const match = value.match(new RegExp(`^${pattern}$`));
      if (match)
        return chinese[key].replace(/\{(\w+)\}/g, (_, name) => match[names.indexOf(name) + 1]);
    }
    const fragments = {
      "Preview truncated.": "预览已截断。",
      "Refresh failed.": "刷新失败",
      "Launch request dispatched": "启动请求已发送",
    };
    return fragments[value] ?? value;
  }
  return new Proxy(page, {
    get(target, property) {
      if (property === "getByRole")
        return (role, options) => target.getByRole(role, { ...options, name: text(options?.name) });
      if (property === "getByText")
        return (value, options) => target.getByText(text(value), options);
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

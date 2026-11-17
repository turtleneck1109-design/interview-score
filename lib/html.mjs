// Rebuild the application from its static assets, never from the live scoring UI.
export function standaloneHtml(script,styles){
 const js=script.replace(/<\/script/gi,'<\\/script');
 return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>面试评分台 · 免登录离线版</title><style id="app-style">'+styles+'</style></head><body><div id="root"></div><noscript>请启用浏览器 JavaScript 以使用评分功能。</noscript><script id="app-script">'+js+'</script></body></html>';
}

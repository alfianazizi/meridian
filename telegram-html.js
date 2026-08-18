export function escapeTelegramHTML(value){
 return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

export function stripTelegramHTML(value){
 return String(value??'').replace(/<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre)(?:\s[^>]*)?>/gi,'').replace(/<a\s+href="[^"]*">/gi,'').replace(/<\/a>/gi,'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
}

const paths={
 edit:'M4 20h4L20 8l-4-4L4 16v4M14 6l4 4',
 expand:'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
 save:'M5 3h12l4 4v14H3V3h2M7 3v6h10V3M7 21v-8h10v8',
 close:'M6 6l12 12M18 6 6 18',
 undo:'M9 5 4 10l5 5M4 10h9a6 6 0 0 1 6 6',
 trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
 point:'M12 3v6M12 15v6M3 12h6M15 12h6M9 9l6 6M15 9l-6 6',
 check:'M5 12l4 4L19 6',
 next:'M5 12h14M13 6l6 6-6 6',
 back:'M19 12H5M11 6l-6 6 6 6',
 image:'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M15 7h.01',
 zoomIn:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6M7 10h6M10 7v6',
 zoomOut:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6M7 10h6',
 center:'M3 3v18M21 3v18M7 8h10v8H7ZM12 3v4M12 17v4',
 horizontal:'M3 12h4M17 12h4M7 7h10v10H7ZM12 3v4M12 17v4',
 rotate:'M4 10a8 8 0 1 1 1 8M4 4v6h6',
 top:'M3 4h18M7 8h10v12H7Z',
 left:'M4 3v18M8 7h12v10H8Z',
 depth:'M4 5h16M8 9h8M12 9v11M8 16l4 4 4-4',
 collapse:'M5 15l7-7 7 7'
};
export function logoIcon(name){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
 for(const [key,value]of Object.entries({viewBox:'0 0 24 24',width:18,height:18,fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
 path.setAttribute('d',paths[name]??paths.edit);svg.append(path);return svg;
}
export function setLogoButtonIcon(button,name,title){button.replaceChildren(logoIcon(name));button.title=title;button.setAttribute('aria-label',title);button.setAttribute('data-logo-icon',name);return button;}

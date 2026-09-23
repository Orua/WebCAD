// Small line icons for the quick-model picker. They describe the template
// family only; they are not product previews or dimensioned drawings.
const paths = Object.freeze({
  flatFrame:'M3 5h18v14H3z M7 9h10v6H7z',
  mountingPlate:'M3 7q0-2 2-2h14q2 0 2 2v10q0 2-2 2H5q-2 0-2-2z M7 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M14 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  bossPlate:'M3 8h18v9H3z M6 8v-3h4v3 M14 8v-3h4v3 M7 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M15 5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  flangedBushing:'M4 8h16v8H4z M8 5h8v3H8z M10 5v11 M14 5v11',
  openArcRing:'M18.5 7.2A8 8 0 1 0 18.5 16.8',
  roundedBossTray:'M3 6q0-2 2-2h14q2 0 2 2v12H3z M6 8h12v7H6z M8 15v-3 M16 15v-3',
  roundBadge:'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16 M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10 M9 20v2 M15 20v2',
  thinWallTray:'M3 5h18v14H3z M6 8h12v8H6z M8 16v-4 M16 16v-4',
  tube:'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16 M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  counterboreTool:'M8 3h8v5h3v4h-5v9h-4v-9H5V8h3z',
  ring:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
  dBuckle:'M6 3h5a8 8 0 0 1 0 16H6z',
  dBarBuckle:'M6 3h5a8 8 0 0 1 0 16H6z M6 17h10',
  rectBuckle:'M3 5h18v14H3z',
  sliderBuckle:'M3 5h18v14H3z M12 5v14',
  ovalBuckle:'M8 4h8a8 8 0 0 1 0 16H8A8 8 0 0 1 8 4z',
  washer:'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16 M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
});

export function quickModelIcon(kind) {
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','quick-model-icon');svg.setAttribute('aria-hidden','true');
  path.setAttribute('d',paths[kind]||'M4 4h16v16H4z');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');
  path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
  svg.append(path);return svg;
}

export const quickModelIconKinds=Object.freeze(Object.keys(paths));

const inputError=(message,code)=>Object.assign(new Error(message),{code});
export function fitLogoWidth(logo,targetWidthMm){
 if(targetWidthMm===undefined)return logo;
 if(!(Number.isFinite(targetWidthMm)&&targetWidthMm>0))throw inputError('图案宽度必须大于 0 mm。','SIZE_REQUIRED');
 const points=logo.regions.flatMap(r=>r.outer),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(let i=0;i<xs.length;i++){minX=Math.min(minX,xs[i]);maxX=Math.max(maxX,xs[i]);minY=Math.min(minY,ys[i]);maxY=Math.max(maxY,ys[i]);}
 const width=maxX-minX,factor=targetWidthMm/width;if(!(width>0&&Number.isFinite(factor)))throw inputError('没有可缩放的有效 LOGO 轮廓。','INVALID_CONTOUR');
 const frame=logo.source?.rasterFrame,rasterFrame=frame?{...frame,...Object.fromEntries(['xMm','yMm','widthMm','heightMm','mmPerPixel'].map(key=>[key,frame[key]*factor]))}:undefined;
 const scaledReport=(report,keys)=>report?{...report,...Object.fromEntries(keys.filter(key=>Number.isFinite(report[key])).map(key=>[key,report[key]*factor]))}:report;
 const rasterSmoothing=scaledReport(logo.source?.rasterSmoothing,['requestedToleranceMm','effectiveToleranceMm','curveDistanceUpperBoundMm','coordinateRoundingMm']);
 const rasterTopology=scaledReport(logo.source?.rasterTopology,['curveDistanceUpperBoundMm']);
 const conversionReport=scaledReport(logo.source?.conversionReport,['requestedToleranceMm','approximationBoundMm']);
 const conversion=scaledReport(logo.source?.conversion,['requestedToleranceMm','approximationBoundMm']);
 // Preserve the converter's original contour bytes/frame and hash. Record its
 // explicit transform into the fitted logo instead of silently rewriting proof.
 const rasterOriginalContoursToLogo=logo.source?.rasterOriginalContours?{scale:(logo.source.rasterOriginalContoursToLogo?.scale??1)*factor,translationMm:[0,0],from:'converter-original-mm',to:'logo-mm'}:undefined;
 return {...logo,sizeMm:[targetWidthMm,(maxY-minY)*factor],regions:logo.regions.map(r=>({outer:r.outer.map(p=>p.map(v=>v*factor)),holes:(r.holes||[]).map(h=>h.map(p=>p.map(v=>v*factor)))})),source:{...(typeof logo.source==='object'?logo.source:{original:logo.source}),...(rasterFrame?{rasterFrame}:{}),...(rasterSmoothing?{rasterSmoothing}:{}),...(rasterTopology?{rasterTopology}:{}),...(conversionReport?{conversionReport}:{}),...(conversion?{conversion}:{}),...(rasterOriginalContoursToLogo?{rasterOriginalContoursToLogo}:{}),widthNormalization:{basis:'contour-bounds',convertedWidthMm:width,requestedWidthMm:targetWidthMm,scale:factor}}};
}

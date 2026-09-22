"""Extract a reviewed logo window from converted DXF; never guess a font.

Dependencies: ezdxf, shapely. Original DWG is read for hash evidence only.
Use the text-to-cad silent launcher on Windows in this workspace.
"""
import argparse, hashlib, json, math, re
from pathlib import Path
import ezdxf
from ezdxf import disassemble, path as dxfpath
from shapely.geometry import Polygon, LineString, box
from shapely.ops import polygonize_full, unary_union

def extract(input_path, product, frame, bounds, mm_per_unit, tolerance_mm=.005, layers=None, source_dwg=None):
    if not (0 < mm_per_unit <= 1000 and .0001 <= tolerance_mm <= .05):
        raise ValueError('Explicit positive unit scale and 0.0001..0.05 mm tolerance required')
    product=product.upper()
    if not re.fullmatch(r'GC\d+',product): raise ValueError('Use a reviewed GC base product number')
    if frame[0]>=frame[2] or frame[1]>=frame[3] or bounds[0]>=bounds[2] or bounds[1]>=bounds[3]:
        raise ValueError('Frame/window bounds must be xmin ymin xmax ymax')
    frame_box,window=box(*frame),box(*bounds)
    if not frame_box.covers(window): raise ValueError('Logo window must be inside reviewed frame')
    doc=ezdxf.readfile(input_path)
    entities=list(disassemble.recursive_decompose(doc.modelspace()))
    titles=[];texts=[]
    for e in entities:
        if e.dxftype() not in ('TEXT','MTEXT','ATTRIB'):continue
        p=e.dxf.insert;value=e.plain_text() if e.dxftype()=='MTEXT' else e.dxf.text
        if frame[0]<=p.x<=frame[2] and frame[1]<=p.y<=frame[3]:
            texts.append({'text':value,'at':[p.x,p.y]})
            codes=re.findall(r'(?i)\bGC\d+[A-Z]?(?:-[A-Z0-9]+)?',value)
            titles.extend({'code':c.upper(),'at':[p.x,p.y],'raw':value} for c in codes)
    if not any(re.match(r'GC\d+',v['code'])[0]==product for v in titles):
        raise ValueError('Requested product not found in selected frame text; review the title block')
    other=sorted({re.match(r'GC\d+',v['code'])[0] for v in titles if re.match(r'GC\d+',v['code'])[0]!=product})
    if other: raise ValueError('Mixed product frame: '+', '.join(other))
    lines=[];chosen=[];crossing=[];unsupported=[]
    allowed={'LINE','ARC','CIRCLE','LWPOLYLINE','POLYLINE','SPLINE','ELLIPSE'}
    z_values=[]
    for i,e in enumerate(entities):
        if layers and e.dxf.layer not in layers:continue
        if e.dxftype() not in allowed:continue
        try:
            curve=dxfpath.make_path(e)
            pts=list(curve.flattening(tolerance_mm/mm_per_unit,segments=8))
        except Exception as exc:
            unsupported.append({'index':i,'type':e.dxftype(),'reason':str(exc)});continue
        if len(pts)<2:continue
        xy=[(p.x,p.y) for p in pts]
        line=LineString(xy)
        if not window.intersects(line):continue
        if not window.covers(line):crossing.append({'index':i,'type':e.dxftype(),'handle':e.dxf.get('handle')});continue
        z_values.extend(p.z for p in pts)
        lines.append(line);chosen.append({'index':i,'handle':e.dxf.get('handle'),'type':e.dxftype(),'layer':e.dxf.layer})
    if unsupported:raise ValueError(f'{len(unsupported)} geometry paths could not be read; inspect before extracting')
    if not lines:raise ValueError('No complete vector outlines inside logo window; TEXT is not converted to a guessed font')
    if max(z_values)-min(z_values)>1e-6/mm_per_unit:raise ValueError('Selected outlines are not coplanar XY geometry')
    # Only reconcile floating-point endpoint noise, never a design-sized gap.
    # 0.0000001 mm is far below the explicit curve flattening tolerance.
    join_mm=1e-7;join=join_mm/mm_per_unit;endpoints=[]
    for li,line in enumerate(lines):
        for index in (0,-1):endpoints.append((li,index,tuple(line.coords[index])))
    buckets={};replacements={};max_join_move=0
    for li,index,pt in endpoints:
        key=(math.floor(pt[0]/join),math.floor(pt[1]/join));matches=[]
        for dx in (-1,0,1):
            for dy in (-1,0,1):
                matches.extend(q for q in buckets.get((key[0]+dx,key[1]+dy),[]) if math.dist(pt,q)<=join)
        if matches:
            q=min(matches,key=lambda v:math.dist(pt,v));replacements[(li,index)]=q;max_join_move=max(max_join_move,math.dist(pt,q)*mm_per_unit)
        else:buckets.setdefault(key,[]).append(pt)
    for li,line in enumerate(lines):
        coords=list(line.coords)
        for index in (0,-1):coords[index]=replacements.get((li,index),coords[index])
        lines[li]=LineString(coords)
    # No gap filling, buffering, or topology repair beyond endpoint roundoff.
    merged=unary_union(lines)
    polygons,cuts,dangles,invalid=polygonize_full(merged)
    if any(not g.is_empty for g in (cuts,dangles,invalid)):
        raise ValueError(f'Open/invalid outline network: cuts={len(cuts.geoms)}, dangles={len(dangles.geoms)}, invalid={len(invalid.geoms)}')
    rings={}
    for poly in polygons.geoms:
        for ring in [poly.exterior,*poly.interiors]:
            candidate=Polygon(ring)
            if not candidate.is_valid or candidate.area<=1e-12:raise ValueError('Invalid closed logo loop')
            rings[candidate.normalize().wkb]=candidate
    loops=list(rings.values())
    if not loops:raise ValueError('No closed outline regions')
    # Nested rings use even-odd fill: preserve letter counters and nested islands.
    depths=[]
    for i,loop in enumerate(loops):
        for j,other_loop in enumerate(loops[:i]):
            if loop.boundary.intersects(other_loop.boundary):raise ValueError('Touching/intersecting logo loops require explicit source repair')
        depths.append(sum(other_loop.contains(loop) for j,other_loop in enumerate(loops) if j!=i))
    minx=min(p.bounds[0] for p in loops);miny=min(p.bounds[1] for p in loops)
    maxx=max(p.bounds[2] for p in loops);maxy=max(p.bounds[3] for p in loops)
    center=((minx+maxx)/2,(miny+maxy)/2)
    def points(ring):return [[round((x-center[0])*mm_per_unit,8),round((y-center[1])*mm_per_unit,8)] for x,y in list(ring.coords)[:-1]]
    regions=[];area=0
    for i,loop in enumerate(loops):
        if depths[i]%2:continue
        holes=[p for j,p in enumerate(loops) if depths[j]==depths[i]+1 and loop.contains(p)]
        regions.append({'outer':points(loop.exterior),'holes':[points(h.exterior) for h in holes]})
        area+=loop.area-sum(h.area for h in holes)
    total=sum(len(r['outer'])+sum(map(len,r['holes'])) for r in regions)
    if len(regions)>150 or total>12000 or any(len(ring)>2000 for r in regions for ring in [r['outer'],*r['holes']]):raise ValueError('Outline exceeds browser limits; choose a smaller reviewed window or coarser explicit tolerance')
    source=Path(source_dwg) if source_dwg else Path(input_path)
    return {'type':'webcad-logo','version':1,'units':'mm','name':product+' reviewed outline','regions':regions,'sizeMm':[round((maxx-minx)*mm_per_unit,8),round((maxy-miny)*mm_per_unit,8)],'areaMm2':area*mm_per_unit**2,'source':{'file':str(source.resolve()),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'convertedDxf':str(Path(input_path).resolve()),'dxfSha256':hashlib.sha256(Path(input_path).read_bytes()).hexdigest(),'product':product,'frame':frame,'window':bounds,'titles':titles,'sourceCenter':center,'sourceZ':z_values[0],'mmPerUnit':mm_per_unit,'flatteningToleranceMm':tolerance_mm,'endpointJoinToleranceMm':join_mm,'maxEndpointMoveMm':max_join_move,'method':'DXF vector paths flattened to closed polygon outlines; no font substitution, no automatic curve wrapping','layers':layers,'entities':chosen,'excludedCrossingEntities':crossing,'pointCount':total}}

def write_preview(packet,target):
    w,h=packet['sizeMm'];pad=max(w,h)*.04
    segments=[]
    for region in packet['regions']:
        for ring in [region['outer'],*region['holes']]:
            segments.append('M '+' L '.join(f'{x:.8f},{-y:.8f}' for x,y in ring)+' Z')
    text=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-w/2-pad} {-h/2-pad} {w+2*pad} {h+2*pad}"><path fill="#173f54" fill-rule="evenodd" d="'+ ' '.join(segments)+'"/></svg>'
    target.write_text(text,encoding='utf-8')

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('input',type=Path);ap.add_argument('--product',required=True)
    ap.add_argument('--frame',type=float,nargs=4,required=True);ap.add_argument('--bounds',type=float,nargs=4,required=True)
    ap.add_argument('--mm-per-unit',type=float,required=True);ap.add_argument('--tolerance-mm',type=float,default=.005)
    ap.add_argument('--layer',action='append');ap.add_argument('--source-dwg',type=Path);ap.add_argument('--output',type=Path,required=True)
    args=ap.parse_args();packet=extract(args.input,args.product,args.frame,args.bounds,args.mm_per_unit,args.tolerance_mm,args.layer,args.source_dwg)
    if args.output.resolve() in [args.input.resolve(),args.source_dwg.resolve() if args.source_dwg else args.input.resolve()]:raise ValueError('Output must not overwrite a source file')
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(packet,ensure_ascii=False,indent=2),encoding='utf-8');write_preview(packet,args.output.with_suffix('.svg'))
    print(json.dumps({'output':str(args.output),'regions':len(packet['regions']),'sizeMm':packet['sizeMm'],'areaMm2':packet['areaMm2'],'points':packet['source']['pointCount']},ensure_ascii=False))

if __name__=='__main__':main()


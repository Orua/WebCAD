"""Render author-generated CAD meshes into shipped previews. Requires vtk + Pillow.
Usage: python scripts/render-quick-model-previews.py <mesh-dir> <asset-dir> <manifest.js>
Never runs in the browser or the normal product build.
"""
from pathlib import Path
import sys,json,hashlib,math
import vtk
from PIL import Image,ImageDraw,ImageFont
mesh_dir,assets,manifest=map(Path,sys.argv[1:4]);assets.mkdir(parents=True,exist_ok=True)
font_path=Path('C:/Windows/Fonts/msyh.ttc')
if not font_path.exists():font_path=Path('C:/Windows/Fonts/simhei.ttf')
font=ImageFont.truetype(str(font_path),23);small=ImageFont.truetype(str(font_path),20);title_font=ImageFont.truetype(str(font_path),24)
entries={};contact=[]
for item in json.loads((mesh_dir/'manifest.json').read_text(encoding='utf-8')):
 kind=item['kind'];data=json.loads((mesh_dir/(kind+'.json')).read_text(encoding='utf-8'));ren=vtk.vtkRenderer();ren.SetBackground(.95,.96,.97)
 all_points=[]
 for body in data['bodies']:
  p=body['positions'];points=vtk.vtkPoints()
  for i in range(0,len(p),3):points.InsertNextPoint(*p[i:i+3]);all_points.append(p[i:i+3])
  cells=vtk.vtkCellArray();tri=body['indices']
  for i in range(0,len(tri),3):
   cells.InsertNextCell(3)
   for ix in tri[i:i+3]:cells.InsertCellPoint(ix)
  poly=vtk.vtkPolyData();poly.SetPoints(points);poly.SetPolys(cells)
  normals=vtk.vtkPolyDataNormals();normals.SetInputData(poly);normals.SetFeatureAngle(35);normals.SplittingOff();normals.ConsistencyOn();normals.Update()
  mapper=vtk.vtkPolyDataMapper();mapper.SetInputConnection(normals.GetOutputPort());actor=vtk.vtkActor();actor.SetMapper(mapper);prop=actor.GetProperty();prop.SetColor(.62,.66,.70);prop.SetSpecular(.6);prop.SetSpecularPower(45);prop.SetAmbient(.18);prop.SetDiffuse(.78);ren.AddActor(actor)
  if data['style']=='transparent-edges':
   prop.SetOpacity(.25)
   ep=vtk.vtkPoints();lines=vtk.vtkCellArray()
   for edge in body['edges']:
    positions=edge['positions'];start=ep.GetNumberOfPoints()
    for i in range(0,len(positions),3):ep.InsertNextPoint(*positions[i:i+3])
    count=len(positions)//3
    if count>1:
     lines.InsertNextCell(count)
     for i in range(count):lines.InsertCellPoint(start+i)
   ed=vtk.vtkPolyData();ed.SetPoints(ep);ed.SetLines(lines);em=vtk.vtkPolyDataMapper();em.SetInputData(ed);ea=vtk.vtkActor();ea.SetMapper(em);ea.GetProperty().SetColor(.13,.20,.26);ea.GetProperty().SetLineWidth(1.1);ren.AddActor(ea)
 xs,ys,zs=zip(*all_points);lo=[min(xs),min(ys),min(zs)];hi=[max(xs),max(ys),max(zs)];c=[(a+b)/2 for a,b in zip(lo,hi)];size=max(b-a for a,b in zip(lo,hi));camera=ren.GetActiveCamera();camera.ParallelProjectionOn();camera.SetViewUp(0,0,1)
 # Below-face view exposes the sleeve's threaded entrance; other parts use iso.
 zdir=-1.1 if kind=='threadedSleeve' else 1.15
 camera.SetPosition(c[0]+size*1.35,c[1]-size*1.8,c[2]+size*zdir);camera.SetFocalPoint(*c)
 win=vtk.vtkRenderWindow();win.SetOffScreenRendering(1);win.AddRenderer(ren);win.SetSize(640,440);win.SetMultiSamples(4);ren.ResetCamera();camera.SetParallelScale(camera.GetParallelScale()*1.07);win.Render()
 def screen(point):
  ren.SetWorldPoint(*point,1);ren.WorldToDisplay();v=ren.GetDisplayPoint();return (round(v[0]),round(440-v[1]))
 def save_render(path):
  capture=vtk.vtkWindowToImageFilter();capture.SetInput(win);capture.Update();writer=vtk.vtkPNGWriter();writer.SetFileName(str(path));writer.SetInputConnection(capture.GetOutputPort());writer.Write()
 temp=mesh_dir/(kind+'.png');save_render(temp);im=Image.open(temp).convert('RGB');raw=temp.read_bytes();digest=hashlib.sha256(raw).hexdigest()[:12];image_name=kind+'-'+digest+'.png';(assets/image_name).write_bytes(raw)
 # A static guide keeps true X/Y/Z overall envelope arrows separate from local
 # parameter callouts; it never pretends a fillet/pitch equals an overall span.
 row_h=36;guide_h=660+row_h*math.ceil(len(data['fields'])/2);guide=Image.new('RGB',(640,guide_h),(242,245,247));guide.paste(im,(0,65));draw=ImageDraw.Draw(guide);draw.text((24,15),data['label']+' · 默认参数尺寸指示',font=title_font,fill=(25,42,54));draw.text((24,524),'参数图例（默认值）',font=font,fill=(25,42,54));
 for i,field in enumerate(data['fields']):
  value=data['defaults'][field['key']]
  if field['type']=='select':value=next((x['label'] for x in field['options'] if x['value']==value),str(value))
  if isinstance(value,bool):value='是' if value else '否'
  if isinstance(value,float):value=f'{value:g}'
  unit=field.get('unit','mm' if field['type']=='number' and 'angle' not in field['key'].lower() and '°' not in field['label'] and 'turn' not in field['key'].lower() and 'count' not in field['key'].lower() else '')
  draw.text((24+(i%2)*310,560+(i//2)*row_h),f"{field['label']} {value} {unit}",font=small,fill=(30,48,60))
 def dim(a,b,text,shift):
  pa,pb=screen(a),screen(b);pa=(pa[0]+shift[0],pa[1]+65+shift[1]);pb=(pb[0]+shift[0],pb[1]+65+shift[1]);draw.line([pa,pb],fill=(35,92,125),width=2)
  dx,dy=pb[0]-pa[0],pb[1]-pa[1];length=max(1,math.hypot(dx,dy));ux,uy=dx/length,dy/length
  for p,sign in [(pa,1),(pb,-1)]:draw.polygon([p,(p[0]+sign*ux*9-uy*4,p[1]+sign*uy*9+ux*4),(p[0]+sign*ux*9+uy*4,p[1]+sign*uy*9-ux*4)],fill=(35,92,125))
  mid=((pa[0]+pb[0])/2,(pa[1]+pb[1])/2);label=f'{text} {lengths[text]:g}';box=draw.textbbox(mid,label,font=small);draw.rectangle((box[0]-4,box[1]-2,box[2]+4,box[3]+2),fill=(242,245,247));draw.text(mid,label,font=small,fill=(35,92,125))
 lengths={axis:round(hi[i]-lo[i],3) for i,axis in enumerate(['X','Y','Z'])};dim([lo[0],lo[1],lo[2]],[hi[0],lo[1],lo[2]],'X',(0,25));dim([hi[0],lo[1],lo[2]],[hi[0],hi[1],lo[2]],'Y',(25,6));dim([hi[0],hi[1],lo[2]],[hi[0],hi[1],hi[2]],'Z',(40,0))
 draw.text((24,guide_h-24),'箭头为外包络 mm；局部尺寸、孔位及 R 见参数图例。',font=small,fill=(53,73,87))
 if data['style']=='transparent-edges':draw.text((24,guide_h-50),'半透明实体 + 真实边线：查看内部螺纹和盲孔结构。',font=small,fill=(53,73,87))
 target=mesh_dir/(kind+'-guide.png');guide.save(target,optimize=True);gb=target.read_bytes();gd=hashlib.sha256(gb).hexdigest()[:12];guide_name=kind+'-guide-'+gd+'.png';(assets/guide_name).write_bytes(gb)
 entries[kind]={'image':'quick-model-previews/'+image_name,'guide':'quick-model-previews/'+guide_name,'style':data['style'],'defaultParams':data['defaults'],'imageSha256':hashlib.sha256(raw).hexdigest(),'guideSha256':hashlib.sha256(gb).hexdigest()}
 tile=im.resize((320,220));ImageDraw.Draw(tile).text((7,5),data['label'],font=font,fill=(15,34,47));contact.append(tile);win.Finalize();print(kind,flush=True)
manifest.write_text('// Author-generated immutable default previews. Regenerate using scripts/generate-quick-model-previews.mjs and render-quick-model-previews.py.\nexport const QUICK_MODEL_PREVIEWS=Object.freeze('+json.dumps(entries,ensure_ascii=False,separators=(',',':'))+');\n',encoding='utf-8')
canvas=Image.new('RGB',(320*6,220*math.ceil(len(contact)/6)),'white')
for i,tile in enumerate(contact):canvas.paste(tile,((i%6)*320,(i//6)*220))
canvas.save(mesh_dir/'all-tools-contact.png');print('Rendered',len(entries),'tools')

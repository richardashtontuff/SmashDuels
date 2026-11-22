#!/usr/bin/env python3
"""Build Briar's curated, foot-anchored atlas from her supplied sprite sheet.

The sheet has variable cell widths, overlapping effects and no dedicated idle
or ledge. Key each chosen silhouette independently and reuse the first whip
stance for idle; the hanging sprite is separately authored.
Requires Pillow, NumPy and SciPy.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'game/assets'
src=Image.open(ROOT/'assets-src/characters/briar-sheets/Briar-01.png').convert('RGB')
# Individual crop, body-centered anchor and source ground level.
C={
 'idle':(12,650,174,792,95,790),
 'r1':(14,25,175,178,95,176),'r2':(180,21,338,178,259,176),
 'r3':(344,18,503,178,424,176),'r4':(521,19,679,178,600,176),
 'r5':(690,18,851,178,770,176),'r6':(865,20,1025,178,944,176),
 'r7':(1038,18,1190,178,1114,176),'r8':(1202,18,1354,178,1278,176),
 'r9':(1360,18,1523,178,1440,176),
 'j1':(215,235,379,405,297,403),'j2':(404,220,562,405,483,403),
 'j3':(568,225,780,405,667,403),'j4':(800,248,991,405,896,403),
 'j5':(1018,273,1218,405,1119,403),'j6':(1270,278,1475,405,1370,403),
 'd1':(15,459,179,592,97,590),'d2':(203,453,378,592,293,590),
 'w1':(178,651,341,792,261,790), 'w2':(670,649,904,793,752,790),
 'w3':(910,648,1382,792,993,790),'w4':(1380,650,1526,792,1455,790),
 'e1':(15,849,184,996,99,993), 'e2':(183,850,363,996,275,993),
 'e3':(385,837,634,997,498,993),
}

def cut(box):
 x0,y0,x1,y1,ax,ay=box
 rgb=np.asarray(src.crop((x0,y0,x1,y1))).astype(np.int16)
 diff=np.max(np.abs(rgb-128),axis=2); mask=diff>22
 lab,n=ndimage.label(mask);size=np.bincount(lab.ravel());size[0]=0
 main=lab==np.argmax(size)
 holes=ndimage.binary_fill_holes(main)&~main;hl,_=ndimage.label(holes);hs=np.bincount(hl.ravel());hs[0]=0
 main |= (hl>0)&(hs[hl]<=100)
 keep=ndimage.binary_dilation(main,iterations=2)
 alpha=np.where(main,1,np.clip((diff-8)/20,0,1)*keep)
 # Thin background shadow strokes are not part of her boots.
 for row in range(max(0,ay-y0-5),alpha.shape[0]):
  line,_=ndimage.label(alpha[row]>.25);sizes=np.bincount(line);sizes[0]=0
  alpha[row][sizes[line]>42]=0
 rgba=np.dstack((rgb.astype('uint8'),(alpha*255).astype('uint8')))
 im=Image.fromarray(rgba,'RGBA');bb=im.getchannel('A').getbbox();im=im.crop(bb)
 return im,(ax-x0-bb[0],ay-y0-bb[1])

I='idle';R=['r1','r2','r3','r4','r5','r6','r7','r8','r9'];J=['j1','j2','j3','j4'];
A={
 'idle':[I], 'walk':R,'run':R,'dash':R[:3], 'jump':J,'fall':['j4','j3'], 'land':['j5','j6',I], 'crouch':['j6'],'turn':['j5'],
 'jab':[I,'w1','w2','w1',I], 'stilt':[I,'w1','w2','w1',I], 'utilt':[I,'w1','e1','w1',I], 'dtilt':['j6',I,'j5',I,'j6'],
 'ssmash':[I,'w1','w2','w1',I], 'usmash':[I,'w1','e1','w1',I], 'dsmash':['j6',I,'j5',I,'j6'], 'dashattack':[I,'d1','d2','d1',I],
 'nair':['j4','j2','w2','j4'], 'fair':['j4','j2','w2','j4'], 'bair':['j4','j2','w2','j4'], 'uair':['j4','j2','e1','j4'], 'dair':['j4','j2','j3','j4'],
 'nspecial':[I,'w1','w3','w2',I], 'sspecial':['d1','d2','r3','d2',I], 'uspecial':['j1','j2','j4','j3','j4'], 'dspecial':[I,'e1','e3','e2',I],
 'shield':[I], 'shieldbreak':['j4'], 'hurt':['j4'], 'launch':['j4'], 'grab':[I,'w1'], 'grabbed':['j4'],
 'rollfwd':['j6','j1','j6'],'rollback':['j6','j1','j6'],'spotdodge':['j6',I],'airdodge':['j1','j4'],
 'down':['j6'],'getup':['j6','j5',I], 'respawn':['j4',I], 'ko':['j4'], 'taunt1':[I,'e1','e2',I], 'taunt2':[I,'w1','w2',I], 'taunt3':[I,'e1','e2',I]
}
TIMING={n:{'strike':2,'wind':1} for n in ['jab','stilt','utilt','dtilt','ssmash','usmash','dsmash','dashattack','nair','fair','bair','uair','dair','nspecial','dspecial']}
TIMING.update({n:{'fit':True} for n in ['sspecial','uspecial']})

def main():
 names=sorted({k for row in A.values() for k in row}); imgs=[];frames={};sources=[]
 folder=OUT/'frames/briar';folder.mkdir(parents=True,exist_ok=True)
 for old in folder.glob('*.png'):
  if old.stem not in names:old.unlink()
 for name in names:
  im,(ax,ay)=cut(C[name]);i=len(imgs);imgs.append(im);frames[name]=[i,round(ax,2),round(ay,2),[]]
  im.save(folder/(name+'.png'));sources.append({'file':name+'.png','tile':i,'source':'Briar-01.png'})
 x=y=2;shelf=0;tiles=[];aw=1024
 for im in imgs:
  if x+im.width+2>aw:x=2;y+=shelf+2;shelf=0
  tiles.append({'x':x,'y':y,'w':im.width,'h':im.height});x+=im.width+2;shelf=max(shelf,im.height)
 atlas=Image.new('RGBA',(aw,y+shelf+2))
 for tile,im in zip(tiles,imgs):atlas.paste(im,(tile['x'],tile['y']))
 (OUT/'atlas').mkdir(parents=True,exist_ok=True);atlas.save(OUT/'atlas/briar.png',optimize=True)
 imgs[names.index(I)].save(OUT/'portraits/briar_base.png')
 (OUT/'atlas/briar.json').write_text(json.dumps({'refH':145,'tiles':tiles,'anims':{n:[frames[k] for k in row] for n,row in A.items()},'actionTiming':TIMING,'sourceFrames':sources},separators=(',',':')))
 print('Briar:',len(imgs),'poses',atlas.size)
if __name__=='__main__':main()

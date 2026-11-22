#!/usr/bin/env python3
"""Build the Nomad atlas from both supplied sheets. Requires Pillow, NumPy and SciPy."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'game/assets'
S=[Image.open(ROOT/'assets-src/characters/nomad-sheets'/f'Nomad-0{i}.png').convert('RGB') for i in (1,2)]
# sheet, crop bounds, body-centered anchor, foot baseline, scale
C={
 'r1':(0,10,35,195,180,106,178,1),'r2':(0,202,35,383,180,293,178,1),'r3':(0,396,35,577,180,485,178,1),'r4':(0,585,35,770,180,681,178,1),
 'r5':(0,778,35,960,180,873,178,1),'r6':(0,970,35,1152,180,1065,178,1),'r7':(0,1158,35,1345,180,1255,178,1),'r8':(0,1355,35,1535,180,1450,178,1),
 'j1':(0,20,246,220,396,120,394,1),'j2':(0,275,236,487,396,378,394,1),'j3':(0,520,218,735,396,628,394,1),'j4':(0,757,225,975,396,865,394,1),'j5':(0,1024,230,1238,396,1130,394,1),'j6':(0,1296,255,1505,396,1400,394,1),
 'dash1':(0,22,462,230,583,126,581,1),'dash5':(0,1090,462,1292,583,1192,581,1),'dash6':(0,1320,462,1525,583,1420,581,1),
 's1':(0,20,644,230,790,120,788,1),'s2':(0,254,650,504,790,360,788,1),'s4':(0,790,650,1015,790,884,788,1),'s6':(0,1306,650,1523,790,1410,788,1),
 'gun':(0,1301,845,1510,990,1395,988,1),
 'roll1':(1,350,200,786,575,575,570,.36),
 'roll2':(1,800,270,1100,575,950,570,.36),'roll3':(1,1090,240,1454,575,1290,570,.36),
 'roll4':(1,1470,235,1865,575,1667,570,.36),
}
def cut(c):
 idx,x0,y0,x1,y1,ax,ay,factor=c; rgb=np.asarray(S[idx].crop((x0,y0,x1,y1))).astype(np.int16)
 bg=136 if idx==0 else 183
 diff=np.max(np.abs(rgb-bg),axis=2);mask=diff>22
 lab,n=ndimage.label(mask);sizes=np.bincount(lab.ravel());sizes[0]=0;main=lab==np.argmax(sizes)
 holes=ndimage.binary_fill_holes(main)&~main;hl,_=ndimage.label(holes);hs=np.bincount(hl.ravel());hs[0]=0;main|=(hl>0)&(hs[hl]<=100)
 keep=ndimage.binary_dilation(main,iterations=2);alpha=np.where(main,1,np.clip((diff-8)/20,0,1)*keep)
 for row in range(max(0,ay-y0-5),alpha.shape[0]):
  line,_=ndimage.label(alpha[row]>.25);sizes=np.bincount(line);sizes[0]=0;alpha[row][sizes[line]>42/factor]=0
 im=Image.fromarray(np.dstack((rgb.astype('uint8'),(alpha*255).astype('uint8'))),'RGBA');bb=im.getchannel('A').getbbox()
 if not bb: raise ValueError(c)
 im=im.crop(bb); anchor=((ax-x0-bb[0])*factor,(ay-y0-bb[1])*factor)
 if factor!=1: im=im.resize((round(im.width*factor),round(im.height*factor)),Image.Resampling.LANCZOS)
 return im,anchor
# The supplied rifle-ready pose is the resting stance as well as the shooting pose.
I='gun';R=[f'r{i}' for i in range(1,9)];J=[f'j{i}' for i in range(1,7)];D=['dash1','dash5','dash6'];U=[I,'roll1','roll2','roll3','roll4',I]
A={
 'idle':[I], 'walk':R,'run':R,'dash':D,'jump':J[:4],'fall':[J[3]],'land':[J[5],I],'crouch':[J[5]],'turn':[J[5]],
 'jab':[I,'s1','s4','s6',I],'stilt':[I,'s1','s4','s6',I],'utilt':[I,'s1','s2','s6',I],'dtilt':[J[5],'s1','s4',J[5],I],
 'ssmash':[I,'s1','s4','s6',I],'usmash':[I,'s1','s2','s6',I],'dsmash':[J[5],'s1','s4',J[5],I],'dashattack':[I,D[0],'s4',D[2],I],
 'nair':[J[3],J[1],'s4',J[3]],'fair':[J[3],J[1],'s4',J[3]],'bair':[J[3],J[1],'s4',J[3]],'uair':[J[3],J[1],'s2',J[3]],'dair':[J[3],J[1],J[2],J[3]],
 'nspecial':['gun'],'sspecial':[D[0],'strike','strike',D[1],I],'uspecial':U,'dspecial':[I,'s1','s4','s6',I],
 'shield':[I],'shieldbreak':[J[3]],'hurt':[J[3]],'launch':[J[3]],'grab':[I,'s1'],'grabbed':[J[3]],'rollfwd':U,'rollback':U,'spotdodge':['roll1',I],'airdodge':['roll2','roll3'],'down':['roll4'],'getup':['roll4',I],'respawn':[J[3],I],'ko':[J[3]],'taunt1':[I,'s1',I],'taunt2':[I,'gun',I],'taunt3':[I,'s1',I]}
TIMING={n:{'strike':2,'wind':1} for n in ['jab','stilt','utilt','dtilt','ssmash','usmash','dsmash','dashattack','nair','fair','bair','uair','dair','dspecial']};TIMING['sspecial']={'strike':2,'wind':1};TIMING.update({n:{'fit':True} for n in ['nspecial','uspecial']})
def strike():
 rgb=np.asarray(Image.open(ROOT/'assets-src/characters/nomad-sheets/gun-strike.png').convert('RGB')).astype(np.float32)
 green=rgb[:,:,1]-np.maximum(rgb[:,:,0],rgb[:,:,2]);alpha=np.clip((75-green)/65,0,1)
 im=Image.fromarray(np.dstack((rgb.astype('uint8'),(alpha*255).astype('uint8'))),'RGBA');bb=im.getchannel('A').getbbox();im=im.crop(bb)
 factor=145/im.height;im=im.resize((round(im.width*factor),145),Image.Resampling.LANCZOS)
 return im,((480-bb[0])*factor,(1190-bb[1])*factor)
def main():
 names=sorted({k for row in A.values() for k in row});imgs=[];frames={};sources=[];folder=OUT/'frames/nomad';folder.mkdir(parents=True,exist_ok=True)
 for old in folder.glob('*.png'):
  if old.stem not in names: old.unlink()
 for name in names:
  im,(ax,ay)=strike() if name=='strike' else cut(C[name]);
  # The sheet parks airborne poses above a printed ground shadow; use the
  # actual boot bottom rather than that shadow as the fighter's feet.
  if name in ('j3','j4'): ay=im.height
  i=len(imgs);imgs.append(im);frames[name]=[i,round(ax,2),round(ay,2),[]];im.save(folder/(name+'.png'));sources.append({'file':name+'.png','tile':i,'source':'gun-strike.png' if name=='strike' else f'Nomad-0{C[name][0]+1}.png'})
 x=y=2;shelf=0;tiles=[];aw=1024
 for im in imgs:
  if x+im.width+2>aw:x=2;y+=shelf+2;shelf=0
  tiles.append({'x':x,'y':y,'w':im.width,'h':im.height});x+=im.width+2;shelf=max(shelf,im.height)
 atlas=Image.new('RGBA',(aw,y+shelf+2))
 for tile,im in zip(tiles,imgs):atlas.paste(im,(tile['x'],tile['y']))
 atlas.save(OUT/'atlas/nomad.png',optimize=True);imgs[names.index(I)].save(OUT/'portraits/nomad_base.png')
 (OUT/'atlas/nomad.json').write_text(json.dumps({'refH':145,'tiles':tiles,'anims':{n:[frames[k] for k in row] for n,row in A.items()},'actionTiming':TIMING,'sourceFrames':sources},separators=(',',':')))
 print('Nomad:',len(imgs),'poses',atlas.size)
if __name__=='__main__':main()

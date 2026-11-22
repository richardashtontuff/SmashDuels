#!/usr/bin/env python3
"""Build Tide's atlas from the supplied sheet and a generated idle portrait.

The source rows are irregular and contain caption/number badges; bounds, foot
anchors, knife-hand coordinates and badge masks below are reviewed per pose.
Requires Pillow, NumPy and SciPy. No random variants are used.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
R=Path(__file__).resolve().parent.parent
SRC=R/'assets-src/characters/tide-sheets'; OUT=R/'game/assets'
def key(path):
    rgb=np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    a=np.clip((38-np.minimum(g-np.maximum(r,b),g-90))/30,0,1)
    a[a<.1]=0
    rgb[:,:,1]=np.where((a>0)&(a<1),np.minimum(g,np.maximum(r,b)+18),g)
    return Image.fromarray(np.dstack((rgb.astype('uint8'),(a*255).astype('uint8'))),'RGBA')
sheet=key(SRC/'Tide-01.png')
# bounds, nominal center/foot, badge center, and optional rear-hand grip in sheet pixels.
C={
 'r1':((10,50,235,261),(145,256),(115,247),(73,150)),
 'r2':((235,35,408,261),(336,256),(330,247),(254,141)),
 'r3':((375,35,566,261),(485,256),(514,247),(450,155)),
 'r4':((555,30,750,261),(666,256),(683,247),(710,136)),
 'r5':((730,30,930,261),(844,256),(850,247),(837,137)),
 'r6':((905,30,1115,261),(1024,256),(998,247),(969,139)),
 'r7':((1104,30,1300,261),(1218,256),(1201,247),(1280,146)),
 'r8':((1303,30,1520,261),(1415,256),(1407,247),(1361,137)),
 'j1':((20,321,230,524),(140,512),(119,506),(69,423)),
 'j2':((239,287,424,514),(342,508),(330,506),(273,378)),
 'j3':((410,269,642,500),(531,490),None,None),
 'j4':((650,292,855,500),(752,486),(744,505),(663,368)),
 'j5':((840,335,1060,525),(963,520),(987,505),None),
 'j6':((1070,345,1318,525),(1192,520),(1200,505),(1103,405)),
 'd1':((10,575,225,711),(134,708),(119,708),None),
 'd2':((220,568,478,711),(359,708),(346,708),None),
 'd3':((431,568,725,711),(570,708),(615,708),None),
 'd6':((1241,562,1525,712),(1375,710),(1326,708),None),
 's1':((10,790,119,977),(71,972),(73,987),(28,884)),
 's2':((116,782,260,975),(181,971),(184,987),None),
 's3':((255,777,397,975),(322,971),(320,987),None),
 's4':((395,777,515,975),(451,971),(450,987),None),
 's5':((510,790,639,975),(575,971),(580,987),(521,858)),
 's6':((640,777,754,975),(699,971),(691,987),(682,794)),
 'g1':((760,779,865,974),(819,970),(821,987),(800,818)),
 'g2':((865,778,985,974),(931,970),(930,987),(891,906)),
 'g3':((985,775,1122,974),(1058,970),(1055,987),(1014,907)),
 'g4':((1123,735,1264,974),(1190,970),(1192,987),(1150,907)),
 'g5':((1264,775,1398,974),(1328,970),(1321,987),(1276,868)),
 'g6':((1398,775,1525,974),(1465,970),(1454,987),(1415,867)),
}
# Knife isolated from the authored sixth dash frame. Rotate/flip it so its guard
# sits immediately behind the closed hand; the hand remains in the foreground.
blade=sheet.crop((1446,627,1524,664)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
blade=blade.resize((52,25),Image.Resampling.LANCZOS)
# Transparent canvas contains the original grip, avoiding a detached silhouette.
def cut(k):
    box,anchor,badge,hand=C[k]; x0,y0,x1,y1=box
    img=sheet.crop(box)
    if badge:
        d=ImageDraw.Draw(img);bx,by=badge
        d.ellipse((bx-x0-16,by-y0-16,bx-x0+16,by-y0+16),fill=(0,0,0,0))
    if k.startswith('s'):
        # Small severed pieces of adjacent poses intrude on these cells.
        a=np.asarray(img.getchannel('A')); labels,count=ndimage.label(a>40)
        sizes=np.bincount(labels.ravel());sizes[0]=0;main=sizes.argmax()
        borders=set(labels[:,0]) | set(labels[:,-1]);borders.discard(0);borders.discard(main)
        if borders:
            pixels=np.array(img);pixels[:,:,3][np.isin(labels,list(borders))]=0;img=Image.fromarray(pixels)
    if hand:
        # Space for a knife extending beyond the source cell, without importing
        # a neighboring pose. Shift the cell origin along with the pixels.
        hx,hy=hand; under=Image.new('RGBA',(img.width+55,img.height+25))
        under.alpha_composite(blade,(hx-x0+55-48,hy-y0-11+12))
        under.alpha_composite(img,(55,12));img=under;x0-=55;y0-=12
    # Locomotion poses are isolated figures. Discard disconnected fragments of
    # neighboring poses that cross an irregular cell boundary.
    if k[0] in 'rj':
        a=np.asarray(img.getchannel('A')); labels,count=ndimage.label(a>40)
        sizes=np.bincount(labels.ravel()); sizes[0]=0
        main=labels==sizes.argmax()
        # Include antialiased edges within one pixel of the kept silhouette.
        keep=ndimage.binary_dilation(main,iterations=2)
        pixels=np.array(img);pixels[:,:,3]=np.where(keep,pixels[:,:,3],0);img=Image.fromarray(pixels)
    bb=img.getchannel('A').getbbox()
    if not bb: raise ValueError(k)
    img=img.crop(bb)
    return img,(anchor[0]-x0-bb[0],anchor[1]-y0-bb[1])
idle=key(SRC/'tide-idle-generated.png');bbox=idle.getchannel('A').getbbox();idle=idle.crop(bbox)
idle=idle.resize((round(idle.width*180/idle.height),180),Image.Resampling.LANCZOS)
I='idle'; # Follow the source's stride in one direction; ping-ponging the poses made
# the feet run backwards halfway through every cycle.
Rn=['r1','r2','r3','r6','r8']; J=['j1','j2','j3','j4','j5','j6']; D=['d1','d1','d6','d6']; S=['s1','s2','s3','s4','s5','s6']; G=['g1','g2','g3','g4','g5','g6']
A={'idle':[I], 'walk':Rn,'run':Rn,'dash':D,'jump':J[:4], 'fall':[J[3],J[0]],'land':[J[5],J[4],I], 'crouch':[J[4]], 'turn':['r8'],
 'jab':[I,S[0],S[1],I], 'stilt':[I,S[0],S[2],S[3],I], 'utilt':[I,J[1],J[2],J[3],I], 'dtilt':[J[4],S[0],S[3],J[4],I],
 'ssmash':[I,S[1],S[2],S[3],I], 'usmash':[I,J[1],J[2],J[3],I], 'dsmash':[J[4],S[0],S[4],J[4],I], 'dashattack':[I,D[0],D[3],D[1],I],
 'nair':[J[0],S[0],S[4],J[3]],'fair':[J[0],S[1],S[2],J[3]],'bair':[J[0],S[1],S[2],J[3]],'uair':[J[0],J[1],J[2],J[3]],'dair':[J[0],S[0],S[3],J[3]],
 'nspecial':[I,G[0],G[1],S[4],S[5],I], 'sspecial':[D[0],D[1],D[2],D[3],I], 'uspecial':[I,J[4],J[1],J[2],J[3],J[0]], 'dspecial':[G[0],G[1],G[2],G[3],G[4],G[5],I],
 'shield':[G[0]],'shieldbreak':[J[3]],'hurt':[J[3]],'launch':[J[3]],'grab':[I,S[0]],'grabbed':[J[3]],'rollfwd':[J[4],J[0],J[5]],'rollback':[J[4],J[0],J[5]],'spotdodge':[J[4],I],'airdodge':[J[0],J[3]],'down':[J[5]],'getup':[J[5],J[4],I],'respawn':[J[3],I],'ko':[J[3]],'taunt1':[G[0],G[1],G[2],I],'taunt2':[S[4],S[5],I],'taunt3':[G[3],G[4],G[5],I]}
TIMING={n:{'strike':2,'wind':1} for n in ['jab','stilt','utilt','dtilt','ssmash','usmash','dsmash','dashattack','nair','fair','bair','uair','dair','nspecial']}
TIMING.update({n:{'fit':True} for n in ['sspecial','uspecial','dspecial']})
def main():
 names=sorted({k for row in A.values() for k in row}); images=[]; frames={}; tiles=[]; sources=[]
 folder=OUT/'frames/tide';folder.mkdir(parents=True,exist_ok=True)
 for stale in folder.glob('*.png'):
  if stale.stem not in names: stale.unlink()
 for k in names:
  img,(ax,ay)=(idle,(idle.width*.55,idle.height)) if k==I else cut(k)
  # Normalize figures across irregular source rows without moving their anchors.
  factor=.86 if k[0] in 'rj' else 1.2 if k[0]=='d' else 1
  if k != I and factor != 1:
   img=img.resize((round(img.width*factor),round(img.height*factor)),Image.Resampling.LANCZOS);ax*=factor;ay*=factor
  idx=len(images);images.append(img);frames[k]=[idx,round(ax,2),round(ay,2),[]];img.save(folder/(k+'.png'))
  sources.append({'file':k+'.png','tile':idx,'source':'generated idle' if k==I else 'Tide-01.png'})
 x=y=2;shelf=0;aw=1024
 for img in images:
  if x+img.width+2>aw: x=2;y+=shelf+2;shelf=0
  tiles.append({'x':x,'y':y,'w':img.width,'h':img.height});x+=img.width+2;shelf=max(shelf,img.height)
 atlas=Image.new('RGBA',(aw,y+shelf+2))
 for t,img in zip(tiles,images):atlas.paste(img,(t['x'],t['y']))
 atlas.save(OUT/'atlas/tide.png',optimize=True);idle.save(OUT/'portraits/tide_base.png')
 (OUT/'atlas/tide.json').write_text(json.dumps({'refH':180,'tiles':tiles,'anims':{n:[frames[k] for k in row] for n,row in A.items()},'actionTiming':TIMING,'sourceFrames':sources},separators=(',',':')))
 print('Tide',len(images),'frames',atlas.size)
if __name__=='__main__':main()

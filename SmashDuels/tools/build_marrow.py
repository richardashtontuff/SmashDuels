#!/usr/bin/env python3
"""Build Marrow's curated, stable animation atlas from the supplied sheets.

Requires Pillow and NumPy. The reference sheets mix unrelated actions, have
irregular rows and incompatible styles; only hand-reviewed, similarly sized
poses from sheets 06, 07, 12 and 01 are used. Identifiers are sheet-row-column
(1-based). Rows below are explicit poses in temporal order, not random variants.
Strike indices are aligned with each move's live hit window in render.js.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets-src/characters/marrow-sheets'
OUT = ROOT / 'game/assets'
REVIEW = ROOT.parent / '.cache/marrow-review'

# The first cell is neutral; motion uses comparable high-resolution art only.
I = '06-01-01'; I2 = '06-01-02'
C = '06-03-02'; GUARD = '12-04-01'; HURT = '12-04-05'
J = ['06-02-01','06-02-02','06-02-03','06-02-04','06-02-05','06-02-06']
R = ['06-01-03','06-01-04','06-01-05','06-01-06','06-01-05','06-01-04']
# Anticipation, live strike and recovery are deliberately authored per move.
# Simple attacks share neutral/windups but have distinct strike directions.
A = {
 'idle':[I,I2], 'walk':R, 'run':R, 'dash':R[:4], 'jump':J,
 'fall':[J[4],J[5],J[4]], 'land':['07-02-06',C,I], 'crouch':[C],
 'jab':[I,'06-04-01','07-04-01',I],
 'stilt':[I,'06-04-01','06-04-02','06-04-01',I],
 'utilt':[I,'06-04-03','07-04-03','06-04-03',I],
 'dtilt':[C,'06-04-01','07-04-04',C,I],
 'ssmash':[I,'06-04-01','07-04-02','06-04-01',I],
 'usmash':[I,'06-04-03','07-04-03','06-04-03',I],
 'dsmash':[C,'06-04-01','06-04-05',C,I],
 'dashattack':[R[2],'07-04-05','07-04-06',C,I],
 'nair':[J[2],'06-04-01','06-04-02',J[4]],
 'fair':[J[2],'06-04-01','07-04-02',J[4]],
 'bair':[J[2],'06-04-01','06-04-02',J[4]],
 'uair':[J[2],'06-04-03','07-04-03',J[4]],
 'dair':[J[2],'06-04-01','06-04-04',J[4]],
 'nspecial':[I,'01-03-04','01-03-05','01-03-06',I],
 'sspecial':[I,R[2],'07-04-05','07-04-06',C,I],
 'uspecial':[J[1],J[3],J[3],J[3],J[4],J[5]],
 'dspecial':[I,GUARD,'12-04-02',GUARD,I],
 'shield':[GUARD], 'shieldbreak':[HURT], 'hurt':[HURT], 'launch':[HURT],
 'grab':[I,'07-04-01'], 'grabbed':[HURT],
 'rollfwd':[C,'12-04-03','12-04-04',C], 'rollback':[C,'12-04-03','12-04-04',C],
 'spotdodge':[C,GUARD], 'airdodge':[J[4],J[5]],
 'down':['12-04-03'], 'getup':['12-04-03',C,I],
 'respawn':[J[4],I], 'ko':[HURT],
 'taunt1':['01-03-04','01-03-05','01-03-06',I],
 'taunt2':['01-03-04','01-03-05','01-03-06',I],
 'taunt3':['01-03-04','01-03-05','01-03-06',I],
}
TIMING = {name:{'strike':2,'wind':1} for name in [
 'jab','stilt','utilt','dtilt','ssmash','usmash','dsmash','dashattack',
 'nair','fair','bair','uair','dair','nspecial']}
# These special poses represent motion/guard rather than a single strike.
TIMING.update({name:{'fit':True} for name in ['sspecial','uspecial','dspecial']})

def key_image(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    r,g,b = rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    k = np.minimum(g - np.maximum(r,b), g - 90)
    alpha = np.uint8(np.clip((38-k)/30,0,1)*255)
    alpha[alpha<25]=0
    rgb[:,:,1]=np.where((alpha>0)&(alpha<255),np.minimum(g,np.maximum(r,b)+18),g)
    return Image.fromarray(np.dstack((np.clip(rgb,0,255).astype('uint8'),alpha)), 'RGBA')

def cuts_for_row(alpha,y0,y1):
    ink=(np.asarray(alpha)[y0:y1,:]>40).sum(axis=0)
    cuts=[0]
    for c in range(1,6):
        center=256*c
        cuts.append(min(range(center-30,center+31),key=lambda x:int(ink[x-1:x+2].sum())*5+abs(x-center)*.15))
    return cuts+[1536]

def main():
    needed=sorted({v for row in A.values() for v in row})
    frames={}; images=[]; sources=[]; tiles=[]
    for key in needed:
        sheet,row,col=map(int,key.split('-')); row-=1; col-=1
        im=key_image(SRC/f'Marrow-{sheet:02d}.png')
        y0,y1=row*256,(row+1)*256
        cuts=cuts_for_row(im.getchannel('A'),y0,y1);x0,x1=cuts[col:col+2]
        ink=np.asarray(im.getchannel('A'))>40
        def seam(y):
            if y in (0,1024): return y
            return min(range(max(1,y-20),min(1023,y+21)),
                key=lambda v:int(ink[v-1:v+2,x0:x1].sum())*5+abs(v-y)*.25)
        img=im.crop((x0,seam(y0),x1,seam(y1)));bb=img.getchannel('A').getbbox()
        if not bb: raise ValueError('empty frame '+key)
        img=img.crop(bb);img=img.resize((round(img.width*.6),round(img.height*.6)),Image.Resampling.LANCZOS)
        idx=len(images);images.append(img)
        # Preserve the same original cell origin when art/effects change width.
        ax=((256*col+128)-x0-bb[0])*.6
        frames[key]=[idx,round(ax,2),img.height,[]]
        sources.append({'sheet':sheet,'row':row+1,'column':col+1,'tile':idx,'file':key+'.png'})
    frame_dir=OUT/'frames/marrow';frame_dir.mkdir(parents=True,exist_ok=True)
    # These are generated outputs, not source sheets. Remove stale old atlas cuts.
    for file in frame_dir.glob('*.png'):
        if file.stem not in frames: file.unlink()
    for key,img in zip(needed,images): img.save(frame_dir/(key+'.png'))
    # A spectral echo of the actual blade, isolated from the standing sprite.
    # The rising special orbits this tile around the fighter with a drawn shaft.
    blade=images[needed.index(I)].crop((0,0,44,37))
    ImageDraw.Draw(blade).polygon([(39,28),(44,28),(44,37),(39,37)],fill=(0,0,0,0))
    spin_blade=len(images);images.append(blade)
    # During the special the axe itself moves; erase its stationary head from
    # the raised-arm pose so it cannot read as two separate weapons.
    spin_body=images[needed.index(J[3])].copy()
    ImageDraw.Draw(spin_body).polygon([(0,0),(68,0),(68,12),(59,26),(0,26)],fill=(0,0,0,0))
    spin_body_index=len(images);images.append(spin_body)
    spin_body_entry=[spin_body_index,*frames[J[3]][1:]]
    aw=1024;x=y=2;shelf=0
    for img in images:
        if x+img.width+2>aw: x=2;y+=shelf+2;shelf=0
        tiles.append({'x':x,'y':y,'w':img.width,'h':img.height});x+=img.width+2;shelf=max(shelf,img.height)
    atlas=Image.new('RGBA',(aw,y+shelf+2))
    for tile,img in zip(tiles,images): atlas.paste(img,(tile['x'],tile['y']))
    (OUT/'atlas').mkdir(parents=True,exist_ok=True);atlas.save(OUT/'atlas/marrow.png',optimize=True)
    images[needed.index(I)].save(OUT/'portraits/marrow_base.png')
    anims={name:[frames[k] for k in row] for name,row in A.items()}
    data={'refH':images[needed.index(I)].height,'tiles':tiles,'anims':anims,
          'actionTiming':TIMING,'spinBlade':spin_blade,'spinBody':spin_body_entry,'derived':{},'sourceFrames':sources}
    (OUT/'atlas/marrow.json').write_text(json.dumps(data,separators=(',',':')))
    REVIEW.mkdir(parents=True,exist_ok=True)
    print(f'Marrow: {len(sources)} curated frames, {len(anims)} animations, atlas {atlas.size}')
if __name__=='__main__': main()

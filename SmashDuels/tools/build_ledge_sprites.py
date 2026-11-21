#!/usr/bin/env python3
"""Key and size ledge-pose concepts without rebuilding fighter atlases.

Requires Pillow and NumPy. The source images are AI-generated adaptations of the
original character reference art. They are not
replacement animation sheets. `hand` is the reviewed gripping point in the
original image; the runtime anchors it to the actual ledge on either side.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets-src/ledge-proposals'
OUT = ROOT / 'game/assets/ledge'
# Reference hand coordinates in the original approved images (source pixels).
HAND = {'valor': (782, 21), 'grim': (1001, 22), 'astra': (877, 82),
        'vesper': (621, 355), 'rook': (773, 26), 'marrow': (801, 117)}

def build(key, hand):
    im = Image.open(SRC / (key + '.png')).convert('RGB')
    rgb = np.asarray(im).astype(np.int16)
    r, g, b = rgb[:,:,0], rgb[:,:,1], rgb[:,:,2]
    if key == 'marrow':
        # Marrow was generated on green, not the other poses' magenta backdrop.
        alpha = np.clip((38 - np.minimum(g - np.maximum(r,b), g - 90))/30, 0, 1)
    else:
        alpha = np.maximum.reduce([np.clip((195-np.minimum(r,b))/40, 0, 1),
                                   np.clip((g-28)/35, 0, 1),
                                   np.clip((np.abs(r-b)-20)/25, 0, 1)])
    alpha[alpha < .12] = 0
    rgba = Image.fromarray(np.dstack((rgb.astype('uint8'), (alpha*255).astype('uint8'))), 'RGBA')
    # Ignore isolated compression specks in the magenta field when finding
    # bounds; the old alpha bbox could shrink a fighter to half-size.
    solid = alpha > .5
    ys = np.flatnonzero(solid.sum(axis=1) > 4)
    xs = np.flatnonzero(solid.sum(axis=0) > 4)
    if not len(xs) or not len(ys): raise ValueError(key + ': empty sprite')
    box = (max(0, int(xs[0])-2), max(0, int(ys[0])-2),
           min(im.width, int(xs[-1])+3), min(im.height, int(ys[-1])+3))
    rgba = rgba.crop(box)
    # A little margin keeps sprites safe at their edges. It cannot recreate the
    # pixels clipped by the generated source, so that limitation is documented.
    scale = 180 / rgba.height
    size = (max(1, round(rgba.width * scale)), 180)
    rgba = rgba.resize(size, Image.Resampling.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    rgba.save(OUT / (key + '.png'), optimize=True)
    return {'handX': round((hand[0]-box[0])*size[0]/(box[2]-box[0]), 2),
            'handY': round((hand[1]-box[1])*size[1]/(box[3]-box[1]), 2)}

if __name__ == '__main__':
    meta = {key: build(key, hand) for key, hand in HAND.items()}
    (OUT / 'anchors.json').write_text(json.dumps(meta, indent=2) + '\n')
    print('Built six ledge sprites and hand anchors.')

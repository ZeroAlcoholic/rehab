"""Generate deterministic app icons. Development only; Pillow required."""
from pathlib import Path
from PIL import Image, ImageDraw
import re

target=Path(__file__).resolve().parents[1]/'icons'
target.mkdir(exist_ok=True)
theme=(target.parent/'src/ui/theme.css').read_text(encoding='utf-8')
def color(name):return re.search(r'--'+name+r':\s*(#[0-9a-fA-F]{6})',theme).group(1)
background,foreground=color('forest'),color('icon-line')
(target/'icon.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="{background}"/><path d="M136 302h64v-92h56v140h56V162h64" fill="none" stroke="{foreground}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/></svg>\n',encoding='utf-8')
for size,filename in [(192,'icon-192.png'),(512,'icon-512.png'),(512,'maskable-512.png')]:
    image=Image.new('RGB',(size,size),background)
    draw=ImageDraw.Draw(image)
    points=[(136,302),(200,302),(200,210),(256,210),(256,350),(312,350),(312,162),(376,162)]
    points=[(round(x*size/512),round(y*size/512)) for x,y in points]
    width=round(34*size/512)
    draw.line(points,fill=foreground,width=width,joint='curve')
    for x,y in points:
        r=width/2
        draw.ellipse((x-r,y-r,x+r,y+r),fill=foreground)
    image.save(target/filename)

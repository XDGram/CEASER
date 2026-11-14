# Builds the full soundtrack: voiceover, two music beds (ducked under the voice) and a few cinematic hits.
# The same timeline is written to src/timeline.json so the Remotion scenes line up with the audio.
import json, subprocess, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *x: os.path.join(root, 'public', *x)
dur = lambda f: float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f],capture_output=True,text=True).stdout)

INTRO = 7.0          # tweet montage, music only
REVEAL_GAP = 2.2     # silence + riser between line 2 and "This is CEASER"
GAP = 1.1            # breath between lines
vo, t = [], INTRO
for i in range(1, 11):
    f = P('vo', f'{i:02d}.mp3'); d = dur(f)
    if i == 3: t += REVEAL_GAP - GAP
    if i == 10: t += 0.6
    vo.append({'id': i, 'start': round(t, 2), 'dur': round(d, 2)}); t += d + GAP
reveal = vo[2]['start'] - 0.5
end = vo[9]['start'] + vo[9]['dur'] + 3.5

sfx = [  # file, time the hit should land, offset of the hit inside the file, gain dB
    ('whoosh-fast.mp3', 1.2, 0.4, -16), ('whoosh-fast.mp3', 2.9, 0.4, -18), ('whoosh-fast.mp3', 4.4, 0.4, -18),
    ('whoosh-fast.mp3', 5.7, 0.4, -18),
    ('riser.mp3', reveal, 2.5, -10), ('big-impact.mp3', reveal, 2.1, -6), ('whoosh-deep-impact.mp3', reveal, 0.5, -10),
    ('whoosh-tunnel.mp3', vo[4]['start'] - 0.4, 1.0, -27),   # "Now the twist"
    ('whoosh-tunnel.mp3', vo[6]['start'] - 0.4, 1.0, -27),   # "NEAR is at the core"
    ('logo-impact.mp3', vo[9]['start'] + 0.15, 4.4, -8),     # final "CEASER"
]
json.dump({'fps': 30, 'intro': INTRO, 'reveal': round(reveal, 2), 'end': round(end, 2), 'vo': vo,
           'sfx': [{'file': s[0], 'at': round(s[1], 2)} for s in sfx]},
          open(os.path.join(root, 'src', 'timeline.json'), 'w'), indent=1)

inp, fl = [], []
def add(f): inp.extend(['-i', f]); return len(inp)//2 - 1
for v in vo:
    k = add(P('vo', f"{v['id']:02d}.mp3")); ms = int(v['start']*1000)
    fl.append(f'[{k}]loudnorm=I=-16:TP=-1.5,adelay={ms}|{ms}[v{k}]')
vk = [f'[v{k}]' for k in range(len(vo))]
fl.append(''.join(vk) + f'amix=inputs={len(vo)}:normalize=0,apad=whole_dur={end},asplit=2[vo][key]')
# Bed 1: Voxscape (from its swell) under the tweets and lines 1-2, cut at the reveal.
a = add(P('music','voxscape.mp3'))
fl.append(f'[{a}]atrim=12:{12+reveal},asetpts=N/SR/TB,loudnorm=I=-23,afade=t=in:d=2,afade=t=out:st={reveal-0.35}:d=0.35,apad=whole_dur={end}[m1]')
# Bed 2: Night Sky from the reveal to the end.
b = add(P('music','night-sky.mp3')); rm = int(reveal*1000)
fl.append(f'[{b}]atrim=0:{end-reveal},asetpts=N/SR/TB,loudnorm=I=-23,afade=t=in:d=0.6,afade=t=out:st={end-reveal-4}:d=4,adelay={rm}|{rm}[m2]')
fl.append('[m1][m2]amix=inputs=2:normalize=0[beds]')
fl.append('[beds][key]sidechaincompress=threshold=0.02:ratio=5:attack=60:release=900:makeup=1[music0]')
fl.append(f'[music0]apad=whole_dur={end}[music]')
sk = []
for f, at, off, g in sfx:
    k = add(P('sfx', f)); ms = max(0, int((at-off)*1000))
    fl.append(f'[{k}]volume={g}dB,adelay={ms}|{ms}[s{k}]'); sk.append(f'[s{k}]')
fl.append(''.join(sk) + f'amix=inputs={len(sk)}:normalize=0,apad=whole_dur={end}[fx]')
fl.append('[vo]aresample=async=1:first_pts=0[vox];[music]aresample=async=1:first_pts=0[mux];[fx]aresample=async=1:first_pts=0[fxx]')
fl.append(f'[vox][mux][fxx]amix=inputs=3:normalize=0,atrim=0:{end},alimiter=limit=0.89[pre]')
out = P('soundtrack.mp3'); tmp = P('soundtrack.tmp.wav')
fl[-1] = fl[-1].replace('[pre]', '[out]')
dbg = []
if os.environ.get('STEMS'):
    last = fl.pop()
    fl += ['[vox]asplit[vo1][vo2]', '[mux]asplit[mu1][mu2]', '[fxx]asplit[fx1][fx2]', last.replace('[vox][mux][fxx]', '[vo1][mu1][fx1]')]
    for k in ('vo2', 'mu2', 'fx2'): dbg += ['-map', f'[{k}]', P(f'stem-{k}.wav')]
subprocess.run(['ffmpeg','-y','-v','error',*inp,'-filter_complex',';'.join(fl),'-map','[out]','-ar','48000',tmp, *dbg], check=True)
# Static gain to about -15 LUFS (keeps the dynamics, unlike a one-pass loudnorm), then a safety limiter.
import re
m = subprocess.run(['ffmpeg','-i',tmp,'-af','ebur128','-f','null','-'],capture_output=True,text=True).stderr
lufs = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', m)[-1])
subprocess.run(['ffmpeg','-y','-v','error','-i',tmp,'-af',f'volume={-16-lufs}dB,alimiter=limit=0.8:level=false','-b:a','256k',out], check=True)
os.remove(tmp)
print('wrote', out, 'length', round(end, 1), 's; reveal at', round(reveal, 2))
for v in vo: print(f"line {v['id']:>2} at {v['start']:>6}s ({v['dur']}s)")

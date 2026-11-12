"""Slim the companion's glTF figures (public/figures/*.glb) without changing how they look or move.

  python tools/slim-figures.py public/figures/ibn_ezra.glb [more.glb ...]    (writes in place; run once per new export)

What it does, all of it lossless to the eye:
  * animation: keyframes that lie on the straight line (or slerp) between their neighbours are dropped, within a tolerance
    below a pixel (rotation 0.03°, translation 1e-5 of its size); a channel that never moves keeps two keys (so every clip keeps its length and its crossfades)
  * normals as 8-bit, texture coordinates and skin weights as 8/16-bit (KHR_mesh_quantization, which three.js reads natively)
  * indices as 16-bit where the mesh has fewer than 65,536 vertices
No outside tools: Python and numpy only.
"""
import json, struct, sys
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
# rotation: quaternion components (2.5e-4 ≈ 0.03°); scale: absolute; translation: relative to the channel's own size, since
# exporters differ by orders of magnitude in units (a Mixamo skeleton is in the thousands)
TOL = {'rotation': 2.5e-4, 'scale': 1e-4}
REL_TRANSLATION = 1e-5


def load(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF'
    off, j, bin_ = 12, None, b''
    while off < len(b):
        ln, kind = struct.unpack('<II', b[off:off + 8])
        chunk = b[off + 8:off + 8 + ln]
        if kind == 0x4E4F534A: j = json.loads(chunk)
        elif kind == 0x004E4942: bin_ = chunk
        off += 8 + ln
    return j, bin_


def read(j, bin_, i):
    a = j['accessors'][i]
    assert 'sparse' not in a
    n, k, dt = a['count'], NC[a['type']], CT[a['componentType']]
    v = j['bufferViews'][a['bufferView']]
    start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    item = np.dtype(dt).itemsize * k
    stride = v.get('byteStride', item)
    raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * (n - 1) + item, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(n, item), strides=(stride, 1))
    out = np.ascontiguousarray(rows).view(dt).reshape(n, k)
    if a.get('normalized'):
        out = out.astype(np.float64) / np.iinfo(dt).max
    return out


def slerp_err(q0, q1, q, t):
    """distance between q and the slerp of q0→q1 at t (three.js slerps quaternion tracks)"""
    d = float(np.dot(q0, q1))
    if d < 0: q1, d = -q1, -d
    if d > 0.9995: r = q0 + t * (q1 - q0)
    else:
        th = np.arccos(d); s = np.sin(th)
        r = (np.sin((1 - t) * th) * q0 + np.sin(t * th) * q1) / s
    r = r / np.linalg.norm(r)
    return min(np.abs(r - q).max(), np.abs(r + q).max())


def reduce_keys(t, v, path, interp):
    n = len(t)
    if n <= 2: return list(range(n))
    tol = TOL.get(path, 1e-4) if path != 'translation' else max(1e-6, REL_TRANSLATION * float(np.abs(v).max()))
    if np.abs(v - v[0]).max() <= tol: return [0, n - 1]          # never moves: two keys keep the clip's length
    if interp == 'STEP':
        keep = [0] + [i for i in range(1, n) if np.abs(v[i] - v[i - 1]).max() > 0]
        if keep[-1] != n - 1: keep.append(n - 1)
        return keep
    keep = [0]
    for i in range(1, n - 1):
        a, c = keep[-1], i + 1
        f = (t[i] - t[a]) / (t[c] - t[a])
        # every key between the last kept one and the next must still be met if key i goes
        ok = True
        for m in range(a + 1, c):
            fm = (t[m] - t[a]) / (t[c] - t[a])
            if path == 'rotation': e = slerp_err(v[a], v[c], v[m], fm)
            else: e = np.abs(v[a] + fm * (v[c] - v[a]) - v[m]).max()
            if e > tol: ok = False; break
        if not ok: keep.append(i)
    keep.append(n - 1)
    return keep


def slim(path):
    j, bin_ = load(path)
    before = len(bin_)
    acc = j['accessors']
    data = {}       # accessor index -> (bytes, componentType, normalized, target, stride)

    def put(i, arr, ct, normalized=False, target=None, stride=None):
        data[i] = (arr, ct, normalized, target, stride)

    # 1. animation: fewer keyframes
    newacc, times = [], {}
    for an in j.get('animations', []):
        for s in an['samplers']:
            if s.get('interpolation', 'LINEAR') == 'CUBICSPLINE': continue
            ch = next(c for c in an['channels'] if an['samplers'][c['sampler']] is s)
            t = read(j, bin_, s['input'])[:, 0].astype(np.float64)
            v = read(j, bin_, s['output']).astype(np.float64)
            if ch['target']['path'] == 'weights':
                continue   # morph weights: several values per key, left alone
            keep = reduce_keys(t, v, ch['target']['path'], s.get('interpolation', 'LINEAR'))
            tk = t[keep].astype(np.float32)
            ti = times.get(tk.tobytes())
            if ti is None:
                ti = len(acc) + len(newacc); times[tk.tobytes()] = ti
                newacc.append({'componentType': 5126, 'count': len(keep), 'type': 'SCALAR', 'min': [float(tk.min())], 'max': [float(tk.max())]})
                data[ti] = (tk, 5126, False, None, None)
            vi = len(acc) + len(newacc); newacc.append({'componentType': 5126, 'count': len(keep), 'type': acc[s['output']]['type']})
            data[vi] = (v[keep].astype(np.float32), 5126, False, None, None)
            s['input'], s['output'] = ti, vi
    acc.extend(newacc)

    # 2. vertex data: quantized where it cannot be seen
    quant = False
    for m in j['meshes']:
        for p in m['primitives']:
            at = p['attributes']
            if 'NORMAL' in at and acc[at['NORMAL']]['componentType'] == 5126 and at['NORMAL'] not in data:
                nrm = read(j, bin_, at['NORMAL']).astype(np.float64)
                q = np.clip(np.round(nrm * 127), -127, 127).astype(np.int8)
                put(at['NORMAL'], np.concatenate([q, np.zeros((len(q), 1), np.int8)], 1), 5120, True, 34962, 4); quant = True
            for key in [k for k in at if k.startswith('TEXCOORD_')]:
                i = at[key]
                if acc[i]['componentType'] != 5126 or i in data: continue
                uv = read(j, bin_, i).astype(np.float64)
                if uv.min() >= 0 and uv.max() <= 1:
                    put(i, np.round(uv * 65535).astype(np.uint16), 5123, True, 34962, 4); quant = True
            for key in [k for k in at if k.startswith('WEIGHTS_')]:
                i = at[key]
                if acc[i]['componentType'] != 5126 or i in data: continue
                w = read(j, bin_, i).astype(np.float64)
                q = np.round(w * 255).astype(np.int32)
                big = q.argmax(1)
                q[np.arange(len(q)), big] += 255 - q.sum(1)          # each vertex's weights still add up to exactly 1
                put(i, np.clip(q, 0, 255).astype(np.uint8), 5121, True, 34962, 4)
            if 'indices' in p and acc[p['indices']]['componentType'] == 5125 and p['indices'] not in data:
                ix = read(j, bin_, p['indices'])
                if ix.max() < 65535: put(p['indices'], ix.astype(np.uint16), 5123, False, 34963, None)
    if quant:
        for k in ('extensionsUsed', 'extensionsRequired'):
            j[k] = sorted(set(j.get(k, [])) | {'KHR_mesh_quantization'})

    # 3. which accessors are still in use (the old animation keys are not)
    used = set()
    for m in j['meshes']:
        for p in m['primitives']:
            used |= set(p['attributes'].values())
            if 'indices' in p: used.add(p['indices'])
            for tg in p.get('targets', []): used |= set(tg.values())
    for an in j.get('animations', []):
        for s in an['samplers']: used |= {s['input'], s['output']}
    for sk in j.get('skins', []):
        if 'inverseBindMatrices' in sk: used.add(sk['inverseBindMatrices'])

    # 4. a new binary chunk: every accessor in use gets its own aligned view; images keep their bytes
    out, views = bytearray(), []
    def view(blob, target=None, stride=None):
        while len(out) % 4: out.append(0)
        v = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(blob)}
        if target: v['target'] = target
        if stride: v['byteStride'] = stride
        out.extend(blob); views.append(v)
        return len(views) - 1
    remap, newlist = {}, []
    for i, a in enumerate(acc):
        if i not in used: continue
        a = dict(a); a.pop('byteOffset', None)
        if i in data:
            arr, ct, normalized, target, stride = data[i]
            a['componentType'] = ct
            if normalized: a['normalized'] = True
            else: a.pop('normalized', None)
            if ct != 5126 and a.get('type') != 'SCALAR' or normalized:
                a.pop('min', None); a.pop('max', None)
            if ct == 5123 and not normalized and a.get('type') == 'SCALAR':
                a['min'], a['max'] = [int(arr.min())], [int(arr.max())]
            a['bufferView'] = view(np.ascontiguousarray(arr).tobytes(), target, stride)
        else:
            old = j['bufferViews'][acc[i]['bufferView']]
            k, dt = NC[a['type']], CT[a['componentType']]
            arr = read(j, bin_, i)
            if a.get('normalized'): arr = np.round(arr * np.iinfo(dt).max).astype(dt)
            item = np.dtype(dt).itemsize * k
            is_vertex = old.get('target') == 34962 or old.get('byteStride')
            blob = np.ascontiguousarray(arr.astype(dt)).tobytes()
            stride = None
            if is_vertex and item % 4:
                stride = item + (4 - item % 4)
                pad = np.zeros((len(arr), stride), np.uint8); pad[:, :item] = np.frombuffer(blob, np.uint8).reshape(len(arr), item); blob = pad.tobytes()
            a['bufferView'] = view(blob, old.get('target'), stride or (item if is_vertex and old.get('byteStride') else None))
        remap[i] = len(newlist); newlist.append(a)
    for img in j.get('images', []):
        if 'bufferView' in img:
            v = j['bufferViews'][img['bufferView']]
            img['bufferView'] = view(bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
    for m in j['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: remap[v] for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = remap[p['indices']]
            if 'targets' in p: p['targets'] = [{k: remap[v] for k, v in tg.items()} for tg in p['targets']]
    for an in j.get('animations', []):
        for s in an['samplers']: s['input'], s['output'] = remap[s['input']], remap[s['output']]
    for sk in j.get('skins', []):
        if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = remap[sk['inverseBindMatrices']]
    j['accessors'], j['bufferViews'] = newlist, views
    while len(out) % 4: out.append(0)
    j['buffers'] = [{'byteLength': len(out)}]

    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    open(path, 'wb').write(glb)
    print(f'{path}: {before / 1e6:.2f} MB of data -> {len(out) / 1e6:.2f} MB')


if __name__ == '__main__':
    for p in sys.argv[1:]: slim(p)

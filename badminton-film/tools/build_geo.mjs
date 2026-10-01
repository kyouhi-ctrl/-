// 预处理世界地图：把 world-atlas（Natural Earth 110m）转成等距圆柱投影的多边形数据，供地球纹理绘制。
import fs from 'fs';
import { feature } from 'topojson-client';
const topo = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-110m.json', 'utf8'));
const fc = feature(topo, topo.objects.countries);
const out = { countries: [] };
for (const f of fc.features) {
  const g = f.geometry; if (!g) continue;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  out.countries.push({ name: f.properties.name, polys: polys.map((p) => p.map((ring) => ring.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]))) });
}
fs.writeFileSync('build/geo.json', JSON.stringify(out));
console.log('countries', out.countries.length, 'bytes', fs.statSync('build/geo.json').size);
console.log(out.countries.map((c) => c.name).filter((n) => /China|Indonesia|Malaysia|Japan|Korea|India|Thailand|Canada|Denmark|United Kingdom|Ireland|France|Netherlands|New Zealand|United States/.test(n)).join(' | '));

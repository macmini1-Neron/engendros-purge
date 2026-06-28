// cave-demo/surfacenets.js — Naive Surface Nets, after Mikola Lysenko (MIT,
// github.com/mikolalysenko/isosurface). THREE-free, pure. Reproduces the canonical
// algorithm, wrapped to take a pre-sampled Float32Array of corner densities and emit
// flat typed arrays (transferable / direct BufferAttribute, no array-of-arrays).
//
// SIGN CONVENTION: solid = density < 0, air = density > 0, surface at 0.
//   (mask bit set when a corner sample < 0 — Lysenko's native convention.)
// dims = CORNER counts per axis [dx,dy,dz]; data length = dx*dy*dz;
//   index(x,y,z) = x + y*dx + z*dx*dy. Cells marched are [0..dx-2] etc.
// Returns vertices in CORNER space (0..dx-1); caller maps to world.

const cube_edges=new Int32Array(24), edge_table=new Int32Array(256);
(function(){
  let k=0;
  for(let i=0;i<8;++i){ for(let j=1;j<=4;j<<=1){ const p=i^j; if(i<=p){cube_edges[k++]=i;cube_edges[k++]=p;} } }
  for(let i=0;i<256;++i){
    let em=0;
    for(let j=0;j<24;j+=2){ const a=!!(i&(1<<cube_edges[j])), b=!!(i&(1<<cube_edges[j+1])); em|= a!==b ? (1<<(j>>1)):0; }
    edge_table[i]=em;
  }
})();

// core: returns { vertices:[[x,y,z],...], faces:[[a,b,c],...] }
function surfaceNetsCore(data, dims){
  const vertices=[], faces=[];
  let n=0;
  const x=new Int32Array(3);
  const R=new Int32Array([1, dims[0]+1, (dims[0]+1)*(dims[1]+1)]);
  const grid=new Float32Array(8);
  let buf_no=1;
  let buffer=new Int32Array(R[2]*2);
  for(x[2]=0; x[2]<dims[2]-1; ++x[2], n+=dims[0], buf_no^=1, R[2]=-R[2]){
    let m=1+(dims[0]+1)*(1+buf_no*(dims[1]+1));
    for(x[1]=0; x[1]<dims[1]-1; ++x[1], ++n, m+=2)
    for(x[0]=0; x[0]<dims[0]-1; ++x[0], ++n, ++m){
      let mask=0,g=0,idx=n;
      for(let k=0;k<2;++k, idx+=dims[0]*(dims[1]-2))
      for(let j=0;j<2;++j, idx+=dims[0]-2)
      for(let i=0;i<2;++i, ++g, ++idx){ const p=data[idx]; grid[g]=p; mask|=(p<0)?(1<<g):0; }
      if(mask===0 || mask===0xff) continue;
      const emask=edge_table[mask]; const v=[0,0,0]; let ecount=0;
      for(let i=0;i<12;++i){
        if(!(emask&(1<<i))) continue;
        ++ecount;
        const e0=cube_edges[i*2], e1=cube_edges[i*2+1];
        const g0=grid[e0], g1=grid[e1]; let t=g0-g1;
        if(Math.abs(t)>1e-6) t=g0/t; else continue;
        for(let j=0,k=1;j<3;++j,k<<=1){ const a=e0&k, b=e1&k; if(a!==b) v[j]+= a?1.0-t:t; else v[j]+= a?1.0:0.0; }
      }
      const s=1.0/ecount;
      for(let i=0;i<3;++i) v[i]=x[i]+s*v[i];
      buffer[m]=vertices.length;
      vertices.push([v[0],v[1],v[2]]);
      for(let i=0;i<3;++i){
        if(!(emask&(1<<i))) continue;
        const iu=(i+1)%3, iv=(i+2)%3;
        if(x[iu]===0 || x[iv]===0) continue;
        const du=R[iu], dv=R[iv];
        if(mask&1){
          faces.push([buffer[m], buffer[m-du], buffer[m-du-dv]]);
          faces.push([buffer[m], buffer[m-du-dv], buffer[m-dv]]);
        }else{
          faces.push([buffer[m], buffer[m-dv], buffer[m-du-dv]]);
          faces.push([buffer[m], buffer[m-du-dv], buffer[m-du]]);
        }
      }
    }
  }
  return { vertices, faces };
}

// wrapper: flat typed arrays. originWorld + voxelSize map corner space -> world.
// dims = corner counts. Returns null if the chunk produced no surface.
export function meshChunk(data, dims, voxelSize, originWorld){
  const { vertices, faces } = surfaceNetsCore(data, dims);
  if(!vertices.length || !faces.length) return null;
  const positions=new Float32Array(vertices.length*3);
  const ox=originWorld[0], oy=originWorld[1], oz=originWorld[2];
  for(let i=0;i<vertices.length;i++){
    const v=vertices[i];
    positions[i*3]  = ox + v[0]*voxelSize;
    positions[i*3+1]= oy + v[1]*voxelSize;
    positions[i*3+2]= oz + v[2]*voxelSize;
  }
  const indices=new Uint32Array(faces.length*3);
  for(let i=0;i<faces.length;i++){ const f=faces[i]; indices[i*3]=f[0]; indices[i*3+1]=f[1]; indices[i*3+2]=f[2]; }
  return { positions, indices, vertCount:vertices.length, triCount:faces.length };
}

export const neutralLayerNames = ['HairBack','LegR','LegL','Body','ArmR','ArmL','Head','EyeROpen','EyeLOpen','MouthSmile']
export const eyeBoxes = {
  R: {left:128,top:110,width:26,height:22},
  L: {left:165,top:109,width:27,height:23}
}
const mouth = {left:149,top:132,width:22,height:12}
// Follow the skin/wrist outline. The old straight cut carried a strip of hair
// with the arm and left the inner half of the forearm in the dress layer.
const armR = [[137,168],[146,169],[147,175],[145,182],[141,189],[136,195],[131,200],[128,204],[124,209],[119,213],[110,214],[106,212],[104,209],[107,205],[113,201],[118,198],[124,194],[129,187],[133,182],[135,176]]
const armL = armR.map(([x,y]) => [320-x,y]).reverse()
// Include the complete shoes; no foot pixels should accidentally inherit the hair's head rotation.
const legR = [[138,237],[160,237],[160,320],[128,320],[128,272],[137,265]]
const legL = legR.map(([x,y]) => [320-x,y]).reverse()
const body = [[139,149],[181,149],[192,155],[197,166],[188,181],[187,188],[201,199],[206,211],[215,227],[212,234],[199,240],[181,244],[141,244],[124,241],[109,234],[105,229],[113,213],[119,203],[128,193],[133,188],[132,179],[124,169],[124,160],[132,155]]

function inBox(x,y,b) { return x>=b.left && x<b.left+b.width && y>=b.top && y<b.top+b.height }
function inPolygon(x,y,polygon) {
  let inside=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [ax,ay]=polygon[i],[bx,by]=polygon[j]
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside
  }
  return inside
}
export function ownerAt(x,y) {
  if(inBox(x,y,eyeBoxes.R)) return 'EyeROpen'
  if(inBox(x,y,eyeBoxes.L)) return 'EyeLOpen'
  if(inBox(x,y,mouth)) return 'MouthSmile'
  if(y<151) return 'Head'
  if(inPolygon(x+.5,y+.5,armR)) return 'ArmR'
  if(inPolygon(x+.5,y+.5,armL)) return 'ArmL'
  if(inPolygon(x+.5,y+.5,legR)) return 'LegR'
  if(inPolygon(x+.5,y+.5,legL)) return 'LegL'
  if(inPolygon(x+.5,y+.5,body)) return 'Body'
  return 'HairBack'
}

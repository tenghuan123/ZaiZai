import { neutralPose, type ActingPose } from './scenes'
import type { CharacterPlayback } from './viewer'
import { blinkOpenness, resolveEyeFrame } from './eye-motion'
import { ActingMotion } from './acting-motion'
import { sampleGesture, type GestureId } from './gestures'

interface Layer { name:string; left:number; top:number; width:number; height:number; file:string; hidden:boolean }
interface Manifest { width:number; height:number; reference:string; layers:Layer[] }
interface DrawingLayer extends Layer { image:HTMLImageElement }

/** An explicitly labelled art/rig study. It does not load or claim to be a Cubism model. */
export class LayerStudy implements CharacterPlayback {
  private layers:Map<string,DrawingLayer>
  private target=():ActingPose=>({...neutralPose})
  private motion=new ActingMotion(neutralPose)
  private mouth=():number=>0
  private previous:number|null=null
  private elapsed=0
  private raf:number|null=null
  private observer:ResizeObserver
  private paused=false
  private reference:HTMLImageElement
  private poseCanvas=document.createElement('canvas')
  private poseContext:CanvasRenderingContext2D
  private context:CanvasRenderingContext2D

  private constructor(private canvas:HTMLCanvasElement,private container:HTMLElement,private manifest:Manifest,layers:DrawingLayer[],reference:HTMLImageElement) {
    this.layers=new Map(layers.map(layer=>[layer.name,layer]));this.reference=reference
    this.poseCanvas.width=manifest.width;this.poseCanvas.height=manifest.height
    const context=canvas.getContext('2d'),poseContext=this.poseCanvas.getContext('2d')
    if(!context||!poseContext)throw new Error('浏览器未提供 2D 画布。')
    this.context=context;this.poseContext=poseContext
    this.verifyNeutral()
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container)
    this.resize();this.raf=requestAnimationFrame(this.tick)
  }

  static async load(canvas:HTMLCanvasElement,container:HTMLElement):Promise<LayerStudy> {
    const response=await fetch('/study/manifest.json')
    if(!response.ok)throw new Error('尚未准备分层预演素材。')
    const manifest:Manifest=await response.json()
    const layers=await Promise.all(manifest.layers.map(async layer=>({...layer,image:await loadImage('/study/'+layer.file)})))
    const reference=await loadImage('/study/'+manifest.reference)
    canvas.dataset.renderer='layer-study'
    return new LayerStudy(canvas,container,manifest,layers,reference)
  }

  setPose(pose:Partial<ActingPose>,mouth:()=>number=()=>0):void {
    const target={...neutralPose,...pose}
    this.target=()=>target;this.mouth=mouth
    delete this.canvas.dataset.gesture;delete this.canvas.dataset.gestureProgress
  }
  setGesture(id:GestureId,progress:()=>number,mouth:()=>number=()=>0):void {
    this.target=()=>{
      const time=progress();this.canvas.dataset.gestureProgress=time.toFixed(4)
      return sampleGesture(id,time)
    }
    this.canvas.dataset.gesture=id;this.mouth=mouth
  }
  setPaused(paused:boolean):void {
    this.paused=paused;this.previous=null
    if(this.raf!==null)cancelAnimationFrame(this.raf)
    this.raf=paused?null:requestAnimationFrame(this.tick)
  }
  destroy():void {this.observer.disconnect();if(this.raf!==null)cancelAnimationFrame(this.raf)}

  private resize():void {
    const bounds=this.container.getBoundingClientRect(),ratio=Math.min(devicePixelRatio,2)
    this.canvas.width=Math.round(bounds.width*ratio);this.canvas.height=Math.round(bounds.height*ratio)
    this.draw()
  }
  private tick=(now:number):void=>{
    this.raf=null;if(this.paused)return
    const dt=this.previous===null?0:Math.min(now-this.previous,100);this.previous=now;this.elapsed+=dt
    this.motion.advance(this.target(),dt/1000)
    this.draw();this.raf=requestAnimationFrame(this.tick)
  }
  private layer(name:string,alpha=1):void {
    if(alpha<=0)return
    const layer=this.layers.get(name);if(!layer)throw new Error('Missing art layer: '+name)
    this.poseContext.globalAlpha=alpha
    this.poseContext.drawImage(layer.image,layer.left,layer.top)
    this.poseContext.globalAlpha=1
  }
  private head(pose:ActingPose,draw:()=>void):void {
    const context=this.poseContext
    context.save();context.translate(160+pose.ParamAngleX*.07,150)
    context.rotate(clamp(pose.ParamAngleZ*.35,-5,5)*Math.PI/180);context.translate(-160,-150);draw();context.restore()
  }
  private arm(side:'L'|'R',value:number):void {
    const context=this.poseContext,x=side==='L'?183:137
    context.save();context.translate(x,171);context.rotate(clamp(value,0,1)*15*(side==='L'?-1:1)*Math.PI/180)
    context.translate(-x,-171);this.layer('Arm'+side);context.restore()
  }
  private compose(pose:ActingPose,mouth:number,blink=1):void {
    const context=this.poseContext
    context.clearRect(0,0,this.manifest.width,this.manifest.height)
    context.save();context.translate(160,292);context.rotate(clamp(pose.ParamBodyAngleZ*.25,-1.5,1.5)*Math.PI/180);context.translate(-160,-292)
    this.layer('LegR');this.layer('LegL')
    const reveal=clamp(Math.max(Math.abs(pose.ParamAngleZ),Math.abs(pose.ParamAngleX)*.3,pose.ParamArmL*20,pose.ParamArmR*20)/2,0,1)
    this.head(pose,()=>{this.layer('HairUnderpaint',reveal);this.layer('HairBack')})
    this.layer('Body');this.arm('R',pose.ParamArmR);this.arm('L',pose.ParamArmL)
    this.head(pose,()=>{
      this.layer('Head');this.layer('EyeROpen');this.layer('EyeLOpen');this.layer('MouthSmile')
      for(const side of ['R','L'] as const){
        const frame=resolveEyeFrame(pose[`ParamEye${side}Open`],blink)
        if(frame===0)this.layer('Eye'+side+'Closed')
        else if(frame===0.5)this.layer('Eye'+side+'Half')
      }
      this.layer('MouthTalk',clamp(mouth,0,1))
    })
    context.restore()
  }
  private draw():void {
    const blink=blinkOpenness(this.elapsed/1000)
    const mouth=clamp(this.mouth(),0,1)
    this.compose(this.motion.pose,mouth,blink)
    const {width,height}=this.canvas,context=this.context
    context.clearRect(0,0,width,height)
    const size=Math.min(width*.84,height*.94),x=(width-size)/2,y=height*.98-size
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high'
    context.drawImage(this.poseCanvas,x,y,size,size)
    this.canvas.dataset.eye=this.motion.pose.ParamEyeLOpen.toFixed(3)
    this.canvas.dataset.eyeLeftFrame=String(resolveEyeFrame(this.motion.pose.ParamEyeLOpen,blink))
    this.canvas.dataset.eyeRightFrame=String(resolveEyeFrame(this.motion.pose.ParamEyeROpen,blink))
    this.canvas.dataset.mouth=mouth.toFixed(3)
    this.canvas.dataset.tilt=this.motion.pose.ParamAngleZ.toFixed(3)
    this.canvas.dataset.armLeft=this.motion.pose.ParamArmL.toFixed(4)
    this.canvas.dataset.armRight=this.motion.pose.ParamArmR.toFixed(4)
    this.canvas.dataset.body=this.motion.pose.ParamBodyAngleZ.toFixed(4)
  }
  private verifyNeutral():void {
    this.compose(neutralPose,0,1)
    const actual=this.poseContext.getImageData(0,0,this.manifest.width,this.manifest.height).data
    const check=document.createElement('canvas');check.width=this.manifest.width;check.height=this.manifest.height
    const context=check.getContext('2d');if(!context)throw new Error('无法验证原画一致性。')
    context.drawImage(this.reference,0,0)
    const expected=context.getImageData(0,0,check.width,check.height).data
    let maximum=0
    for(let i=0;i<actual.length;i+=4){
      maximum=Math.max(maximum,Math.abs(actual[i+3]-expected[i+3]))
      for(let channel=0;channel<3;channel++)maximum=Math.max(maximum,Math.abs(actual[i+channel]*actual[i+3]/255-expected[i+channel]*expected[i+3]/255))
    }
    this.canvas.dataset.neutralMaxError=maximum.toFixed(3)
    if(maximum>2)throw new Error('分层静止合成偏离原图，已停止预演。')
  }
}

function clamp(value:number,min:number,max:number):number {return Math.max(min,Math.min(max,value))}
async function loadImage(url:string):Promise<HTMLImageElement> {
  const image=new Image();image.src=url;await image.decode();return image
}

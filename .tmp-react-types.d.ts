declare namespace JSX { interface IntrinsicElements { [elemName:string]: any } interface Element {} interface ElementChildrenAttribute {children:{}} }
declare module 'react' {
  namespace React {
    type ReactNode = any;
    interface FormEvent<T=any>{currentTarget:T;preventDefault():void;}
    interface MutableRefObject<T> {current:T}
    type FC<P = {}> = (props:P) => JSX.Element;
    type CSSProperties = Record<string,string|number|undefined>;
    interface PointerEvent<T = any> {pointerId:number; clientX:number; clientY:number; currentTarget:T; target:EventTarget;preventDefault():void;stopPropagation():void;}
    interface MouseEvent<T = any> {currentTarget:T; target:EventTarget; preventDefault():void; stopPropagation():void;}
    interface ChangeEvent<T = any> {target:T; currentTarget:T;}
  }
  const React:{ createElement:any; StrictMode:any };
  export = React;
  export function useState<T>(initial:T|(()=>T)):[T,(value:T|((old:T)=>T))=>void];
  export function useEffect(effect:()=>void|(()=>void),deps?:unknown[]):void;
  export function useMemo<T>(fn:()=>T,deps?:unknown[]):T;
  export function useCallback<T extends(...args:any[])=>any>(cb:T,deps:unknown[]):T;
  export function useRef<T>(initial:T):React.MutableRefObject<T>;
  export function useId():string;
}
declare module 'react-dom/client' {export function createRoot(root:any):{render(a:any):void}}
declare module 'react/jsx-runtime' {export const jsx:any;export const jsxs:any;export const Fragment:any;}
declare module 'lucide-react' {const icon:any; export const ArrowLeft:any, ArrowRight:any, ArrowUp:any, BookOpen:any, Camera:any, Check:any, ChevronLeft:any, ChevronRight:any, CircleHelp:any, Crown:any, Gamepad2:any, KeyRound:any, Loader2:any, Settings2:any, ShieldCheck:any, SlidersHorizontal:any, Sparkles:any, Swords:any, Target:any, Trash2:any, UsersRound:any, Volume2:any, VolumeX:any, X:any, Zap:any, Globe2:any, Wifi:any, Copy:any, Link:any, Pause:any, Play:any, Eye:any, RotateCcw:any, FlaskConical:any, Keyboard:any, Smartphone:any, Move:any, ImagePlus:any, AlertTriangle:any, UploadCloud:any, FileJson:any, Wand2:any, ArrowLeftRight:any, Info:any, Save:any, CheckCircle:any, RotateCw:any, Download:any, RefreshCw:any, Settings:any, Monitor:any, Menu:any, Shield:any, ExternalLink:any, UserRound:any, Plus:any, Music:any, Volume:any, FileText:any;}

declare module 'lucide-react' { export const Pencil:any, Heart:any, LockKeyhole:any, Search:any, CheckCircle2:any, ClipboardCopy:any, CloudUpload:any, Image:any, Upload:any, Share2:any; }
interface ImportMeta { readonly env: Record<string,string|boolean|undefined> }

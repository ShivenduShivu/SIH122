import { readCapture } from '../../../../../lib/capture-api';
export async function GET(_request:Request,{params}:{params:Promise<{captureId:string}>}) {return readCapture((await params).captureId);}

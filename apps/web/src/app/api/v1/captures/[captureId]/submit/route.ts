import { captureAction } from '../../../../../../lib/capture-api';
export async function POST(request:Request,{params}:{params:Promise<{captureId:string}>}) {return captureAction(request,(await params).captureId,'submit');}

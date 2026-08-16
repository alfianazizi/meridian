const NO_DEPLOY_MARKER=/^\s*⛔\s*NO DEPLOY\b/im;
const DEPLOYED_MARKER=/^\s*🚀\s*DEPLOYED\b/im;

export function classifyToolFreeFinal({agentType,content,mustUseRealTool,sawToolCall}){
 if(sawToolCall)return'accept';
 if(agentType==='SCREENER'){
  if(NO_DEPLOY_MARKER.test(content)&&!DEPLOYED_MARKER.test(content))return'accept';
  return'reject';
 }
 return mustUseRealTool?'reject':'accept';
}

export function initialToolChoice({agentType,goal,mustUseRealTool}){
 if(agentType==='SCREENER')return'auto';
 const action=/\b(deploy|open|add liquidity|close|exit|withdraw|claim|swap|block|unblock)\b/i;
 return action.test(goal)||mustUseRealTool?'required':'auto';
}

export function shouldStopAfterEmpty(emptyStreak,limit=2){return emptyStreak>=limit;}

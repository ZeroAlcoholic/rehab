import {execFileSync} from 'node:child_process';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20*1024*1024});
const paths=git('diff','--cached','--name-only','--diff-filter=ACMR','-z').split('\0').filter(Boolean);
const blocked=/(^|\/)(private|artifacts|backups|exports|node_modules|__pycache__|public-site)(\/|$)|(^|\/)\.env(?:$|\.(?!example$))|\.(pem|key|log|zip|pyc)$/i;
const credentials=/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"private_key"\s*:\s*"-----BEGIN)/;
const failures=[];
for(const path of paths){
 if(blocked.test(path)||/(^|\/)(client_secret|credentials|service[-_]account).*\.json$/i.test(path)){failures.push(path+': excluded data or credential path');continue;}
 const content=git('show',':'+path);
 if(credentials.test(content))failures.push(path+': possible credential (value suppressed)');
}
if(failures.length){console.error('Commit blocked:\n'+failures.join('\n'));process.exit(1);}
console.log(`Staged safety check: ${paths.length} files checked. Review private text manually.`);

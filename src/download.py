import sys,urllib.request,urllib.parse,ipaddress,socket,os
url,dest=sys.argv[1:3]
limit=int(sys.argv[3]) if len(sys.argv)>3 else 2_000_000_000
expected=int(sys.argv[4]) if len(sys.argv)>4 else 0
def check(u):
    p=urllib.parse.urlparse(u)
    if p.scheme!='https' or not p.hostname: raise ValueError('HTTPS required')
    for info in socket.getaddrinfo(p.hostname,443,type=socket.SOCK_STREAM):
        ip=ipaddress.ip_address(info[4][0])
        if not ip.is_global: raise ValueError('Non-public address forbidden')
class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        check(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)
check(url)
opener=urllib.request.build_opener(SafeRedirect)
request=urllib.request.Request(url,headers={'User-Agent':'CommunityMediaUploader/1.0'})
os.makedirs(os.path.dirname(dest) or '.',exist_ok=True)
with opener.open(request,timeout=45) as response:
    length=response.headers.get('Content-Length')
    encoding=response.headers.get('Content-Encoding','identity').lower()
    if encoding not in ('identity',''): raise ValueError('Compressed HTTP response not allowed for binary media')
    if expected and length and int(length)!=expected: raise ValueError(f'Source size mismatch: HTTP reports {length} bytes, expected {expected}')
    if length and int(length)>limit: raise ValueError('File too large')
    total=0
    with open(dest+'.part','wb') as f:
        while True:
            b=response.read(1024*1024)
            if not b:break
            total+=len(b)
            if total>limit:raise ValueError('File exceeds size limit')
            f.write(b)
if not total:raise ValueError('Empty download')
if length and total!=int(length):raise ValueError(f'Incomplete download: got {total} bytes, HTTP expected {length}')
if expected and total!=expected:raise ValueError(f'Incomplete or wrong media: got {total} bytes, expected {expected}')
os.replace(dest+'.part',dest)
print('Downloaded',total,'bytes')

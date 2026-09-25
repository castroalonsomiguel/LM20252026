import json, re, time
D='/home/user/LM20252026/trading-bot/'
html=open(D+'index.html',encoding='utf-8').read()
engine=open(D+'engine.js',encoding='utf-8').read()
state=json.load(open('estado_real.json',encoding='utf-8'))
head=re.search(r'<head>(.*?)</head>',html,re.S).group(1)
head=re.sub(r'<meta[^>]*>\s*','',head)
body=re.search(r'<body>(.*)</body>',html,re.S).group(1)
snap=json.dumps({'at':int(time.time()*1000),'state':state},ensure_ascii=False).replace('<','\\u003c')
body=body.replace('<script src="engine.js"></script>','<script>window.__CENTINELA_SNAPSHOT__='+snap+';</script>\n<script>\n'+engine.replace('</script','<\\/script')+'\n</script>')
open('centinela_artifact.html','w',encoding='utf-8').write(head.strip()+'\n'+body.strip()+'\n')
print(len(head)+len(body))

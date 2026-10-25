"""Reuse only media proven to match the installed archive payload."""
import hashlib
import re


def media_name(path, fingerprint, cache, extension):
    previous=cache.get(path.lower(),{})
    name=previous.get('name','')
    if previous.get('sha256')==fingerprint and re.fullmatch(r'[a-f0-9]{20}\.'+extension,name):
        return name
    return hashlib.sha256((path.lower()+':'+fingerprint).encode()).hexdigest()[:20]+'.'+extension

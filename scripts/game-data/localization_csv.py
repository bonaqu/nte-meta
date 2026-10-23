"""Read UEExtractor localization CSV, including its unquoted numeric commas."""
import csv


def localized_rows(stream):
    reader=csv.reader(stream)
    header=next(reader,[])
    if len(header)<2 or header[:2]!=['key','source']:
        raise ValueError('Unexpected localization CSV header')
    for columns in reader:
        if len(columns)<2:continue
        # UEExtractor leaves Translation empty, but does not quote every source
        # containing a comma. Recover the complete source, not just column two.
        repaired=len(columns)>len(header)
        source=','.join(columns[1:-1]) if repaired else columns[1]
        yield columns[0],source,repaired

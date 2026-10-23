import io
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/game-data'))
from localization_csv import localized_rows


class LocalizationTests(unittest.TestCase):
    def test_real_export_numeric_commas_and_quoted_strings_survive(self):
        source='key,source,Translation\nST_Item::gold_1000_name,Beetle Coin ×1,000,\nSkill::cooldown,Перезарядка: 2,5 сек.,\nquoted,"One, two, three",\nAtkUp_3,Атака +2,25 %,\n'
        rows=list(localized_rows(io.StringIO(source)))
        self.assertEqual([row[1] for row in rows],['Beetle Coin ×1,000','Перезарядка: 2,5 сек.','One, two, three','Атака +2,25 %'])
        self.assertEqual([row[2] for row in rows],[True,True,False,True])


if __name__=='__main__':unittest.main()

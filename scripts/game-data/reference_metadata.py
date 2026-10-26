"""Keep numeric upgrade costs from reference data, separately from native tables."""


def ability_menu(abilities):
    menu = []
    for ability in abilities:
        entry = {key: ability[key] for key in ('id', 'type', 'ability_type') if key in ability}
        costs = []
        for row in ability.get('materials', []):
            ids = row.get('items_id', [])
            amounts = row.get('amount', [])
            level = row.get('level', '')
            if (not str(level).isdigit() or not 1 <= int(level) <= 20
                    or not isinstance(ids, list) or not 1 <= len(ids) <= 12
                    or not isinstance(amounts, list) or len(ids) != len(amounts)
                    or any(not isinstance(item, str) or not item or len(item) > 160 for item in ids)
                    or any(type(amount) not in (int, float) or not 0 <= amount <= 1_000_000_000
                           or int(amount) != amount for amount in amounts)):
                raise ValueError(f"Invalid reference upgrade costs: {ability.get('id', '?')}")
            costs.append({
                'level': str(level),
                'require_breakthrough_level': row.get('require_breakthrough_level', 0),
                'items_id': ids,
                'amount': amounts,
            })
        if costs:
            if len(costs) > 20 or len({row['level'] for row in costs}) != len(costs):
                raise ValueError(f"Duplicate or excessive upgrade levels: {ability.get('id', '?')}")
            entry['materials'] = costs
        menu.append(entry)
    return menu

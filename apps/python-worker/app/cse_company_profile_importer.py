from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from .config import settings
from .cse_http_importer import CseImportError, clean_text, normalize_number, normalize_symbol


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode('utf-8')).hexdigest()


def _headers() -> dict[str, str]:
    return {
        'User-Agent': settings.cse_import_user_agent,
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://www.cse.lk',
        'Referer': 'https://www.cse.lk/',
    }


def _post_api(api_url: str, data: dict[str, Any]) -> Any:
    with httpx.Client(timeout=settings.cse_company_profile_timeout_seconds, headers=_headers(), follow_redirects=True) as client:
        response = client.post(api_url, data=data)
        response.raise_for_status()
        content_type = response.headers.get('content-type', '')
        if 'json' in content_type.lower():
            return response.json()
        try:
            return response.json()
        except ValueError:
            return {'rawText': response.text}


def _get_html(source_url: str) -> str:
    with httpx.Client(timeout=settings.cse_company_profile_timeout_seconds, headers=_headers(), follow_redirects=True) as client:
        response = client.get(source_url)
        response.raise_for_status()
        return response.text


def _walk_objects(value: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if isinstance(value, dict):
        rows.append(value)
        for child in value.values():
            rows.extend(_walk_objects(child))
    elif isinstance(value, list):
        for item in value:
            rows.extend(_walk_objects(item))
    return rows


def _first_value(payload: Any, keys: list[str]) -> Any:
    keyset = {re.sub(r'[^a-z0-9]+', '', key.lower()) for key in keys}
    for obj in _walk_objects(payload):
        for key, value in obj.items():
            normalized = re.sub(r'[^a-z0-9]+', '', str(key).lower())
            if normalized in keyset and clean_text(value):
                return value
    return None


def _field_from_label(soup: BeautifulSoup, label: str) -> str | None:
    target = label.strip().lower()
    for div in soup.find_all('div'):
        if clean_text(div.get_text(' ', strip=True)).strip().lower() == target:
            parent = div.find_parent('div')
            if not parent:
                continue
            texts = [clean_text(child.get_text(' ', strip=True)) for child in parent.find_all('div', recursive=False)]
            if len(texts) >= 2 and texts[0].strip().lower() == target:
                return texts[1] or None
    return None


def _parse_people_from_html(soup: BeautifulSoup) -> list[dict[str, Any]]:
    people: list[dict[str, Any]] = []
    for section in soup.find_all('section'):
        heading = section.find(['h2', 'h3', 'div'], string=re.compile(r'(Key Executive|Board of Directors|IR Officer)', re.I))
        if not heading:
            continue
        group = clean_text(heading.get_text(' ', strip=True)).upper().replace(' ', '_')
        for candidate in section.find_all('div'):
            text = clean_text(candidate.get_text(' ', strip=True))
            if not text or len(text) > 220:
                continue
            if 'chief executive' in text.lower() or 'chairman' in text.lower() or 'director' in text.lower():
                parts = [clean_text(part) for part in text.split('  ') if clean_text(part)]
                if parts:
                    people.append({'personName': parts[0], 'designation': parts[-1] if len(parts) > 1 else None, 'roleGroup': group, 'rawRow': {'text': text}})
    seen = set()
    deduped = []
    for person in people:
        key = (person['personName'], person.get('designation'), person.get('roleGroup'))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(person)
    return deduped


def _parse_from_html(html: str, symbol: str, source_url: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    soup = BeautifulSoup(html, 'lxml')
    title = soup.find('h1')
    text = soup.get_text(' ', strip=True)
    isin_match = re.search(r'ISIN:\s*([A-Z0-9]+)', text)
    logo = soup.find('img', src=re.compile(r'upload_logo|cdn\.cse\.lk', re.I))
    logo_url = logo.get('src') if logo else None
    if logo_url:
        logo_url = urljoin(source_url, logo_url)

    profile = {
        'symbol': symbol,
        'companyName': clean_text(title.get_text(' ', strip=True)) if title else symbol,
        'isin': isin_match.group(1) if isin_match else None,
        'logoUrl': logo_url,
        'businessSummary': _field_from_label(soup, 'Business Summary'),
        'gicsIndustryGroup': _field_from_label(soup, 'GICS Industry Group'),
        'foundedYear': int(_field_from_label(soup, 'Founded')) if (_field_from_label(soup, 'Founded') or '').isdigit() else None,
        'quotedDate': _field_from_label(soup, 'Quoted Date'),
        'financialYearEnd': _field_from_label(soup, 'Financial Year End'),
        'board': _field_from_label(soup, 'Board'),
        'address': _field_from_label(soup, 'Address'),
        'email': _field_from_label(soup, 'Email'),
        'phone': _field_from_label(soup, 'Phone'),
        'fax': _field_from_label(soup, 'Fax'),
        'website': _field_from_label(soup, 'Website'),
        'companySecretaries': _field_from_label(soup, 'Company Secretaries'),
        'auditors': _field_from_label(soup, 'Auditors'),
        'articlesOfAssociationUrl': None,
        'sourceUrl': source_url,
    }
    association_link = soup.find('a', href=re.compile(r'Association|association|\.pdf', re.I))
    if association_link and association_link.get('href'):
        profile['articlesOfAssociationUrl'] = urljoin(source_url, association_link['href'])
    return profile, _parse_people_from_html(soup)


def _parse_from_api(payload: Any, symbol: str, source_url: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    company_name = clean_text(_first_value(payload, ['companyName', 'name', 'company_name', 'company'])) or symbol
    founded = _first_value(payload, ['founded', 'foundedYear', 'yearFounded'])
    founded_year = int(normalize_number(founded)) if normalize_number(founded) else None
    profile = {
        'symbol': symbol,
        'companyName': company_name,
        'isin': clean_text(_first_value(payload, ['isin', 'ISIN'])) or None,
        'logoUrl': clean_text(_first_value(payload, ['logoUrl', 'logo', 'companyLogo'])) or None,
        'businessSummary': clean_text(_first_value(payload, ['businessSummary', 'business_description', 'profile'])) or None,
        'gicsIndustryGroup': clean_text(_first_value(payload, ['gicsIndustryGroup', 'industryGroup', 'gics'])) or None,
        'foundedYear': founded_year,
        'quotedDate': clean_text(_first_value(payload, ['quotedDate', 'dateListed', 'listedDate'])) or None,
        'financialYearEnd': clean_text(_first_value(payload, ['financialYearEnd', 'yearEnd'])) or None,
        'board': clean_text(_first_value(payload, ['board', 'listedBoard'])) or None,
        'address': clean_text(_first_value(payload, ['address', 'companyAddress'])) or None,
        'email': clean_text(_first_value(payload, ['email'])) or None,
        'phone': clean_text(_first_value(payload, ['phone', 'telephone'])) or None,
        'fax': clean_text(_first_value(payload, ['fax'])) or None,
        'website': clean_text(_first_value(payload, ['website', 'web'])) or None,
        'companySecretaries': clean_text(_first_value(payload, ['companySecretaries', 'secretaries'])) or None,
        'auditors': clean_text(_first_value(payload, ['auditors', 'auditor'])) or None,
        'articlesOfAssociationUrl': clean_text(_first_value(payload, ['articlesOfAssociationUrl', 'associationFile', 'articlesOfAssociation'])) or None,
        'sourceUrl': source_url,
    }
    people: list[dict[str, Any]] = []
    for obj in _walk_objects(payload):
        name = clean_text(obj.get('name') or obj.get('personName') or obj.get('directorName'))
        designation = clean_text(obj.get('designation') or obj.get('position') or obj.get('role'))
        if name and (designation or 'director' in json.dumps(obj).lower() or 'chief executive' in json.dumps(obj).lower()):
            people.append({'personName': name, 'designation': designation or None, 'roleGroup': 'API_PERSON', 'rawRow': obj})
    return profile, people


def run_company_profile_import(symbol: str, source_url: str, api_url: str) -> dict[str, Any]:
    normalized_symbol = normalize_symbol(symbol)
    warnings: list[str] = []
    api_payload: Any = None
    html_payload: str | None = None
    fetch_strategy = 'api-first-html-fallback'
    try:
        api_payload = _post_api(api_url, {'symbol': normalized_symbol})
        profile, people = _parse_from_api(api_payload, normalized_symbol, source_url)
        if profile['companyName'] == normalized_symbol and not profile.get('isin'):
            raise CseImportError('Company profile API payload did not include enough profile fields')
    except Exception as exc:
        warnings.append(f'Company profile API fallback used: {exc}')
        html_payload = _get_html(source_url)
        profile, people = _parse_from_html(html_payload, normalized_symbol, source_url)
        fetch_strategy = 'html-fallback'

    raw_payload = {'apiPayload': api_payload, 'htmlPayload': html_payload[:500000] if html_payload else None}
    profile['rawPayloadHash'] = _hash(raw_payload)
    profile['rawPayload'] = raw_payload
    profile['warnings'] = warnings
    return {
        'status': 'success',
        'sourceUrl': source_url,
        'fetchMode': 'python-http',
        'fetchStrategy': fetch_strategy,
        'browserAutomationEnabled': False,
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'warnings': warnings,
        'profile': profile,
        'people': people,
        'rawPayload': raw_payload,
    }

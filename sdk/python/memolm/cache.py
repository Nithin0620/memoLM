"""
cache.py — Active Cache Management APIs for MemoLM Python SDK.
"""

from typing import Any, Dict, List, Optional, Union
import httpx

from memolm.exceptions import MemoLMError, GatewayUnavailableError
from memolm.models import QAPair


class CacheClient:
    """Synchronous Cache Management API."""

    def __init__(self, client: Any) -> None:
        self._client = client

    def invalidate(
        self,
        version: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Invalidate cached entries by knowledge version tag or tenant.
        """
        target_endpoint = f"{self._client.base_url}/cache/invalidate"
        payload: Dict[str, Any] = {}
        if version is not None:
            payload["version"] = version
        if tenant_id is not None:
            payload["tenant_id"] = tenant_id

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._client.api_key}",
        }
        if tenant_id:
            headers["x-memolm-tenant"] = tenant_id
        if version:
            headers["x-memolm-version"] = version

        try:
            resp = self._client._http_client.post(
                target_endpoint,
                headers=headers,
                json=payload,
            )
            if resp.status_code >= 400:
                raise MemoLMError(f"Cache invalidation failed ({resp.status_code}): {resp.text}", status_code=resp.status_code)
            return resp.json()
        except httpx.RequestError as exc:
            raise GatewayUnavailableError(f"Failed to connect to MemoLM Gateway: {exc}") from exc

    def inspect(
        self,
        query: str,
        version: Optional[str] = None,
        tenant_id: Optional[str] = None,
        risk: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Dry-run a query against Qdrant to inspect what would hit, cosine similarity,
        and whether the Safety Gate would pass or reject, without billing an LLM call.
        """
        target_endpoint = f"{self._client.base_url}/cache/inspect"
        payload: Dict[str, Any] = {
            "query": query,
            "tenant_id": tenant_id or self._client.default_tenant,
            "version": version or self._client.default_knowledge_version,
            "risk": risk or self._client.default_risk,
        }
        if similarity_threshold is not None:
            payload["similarity_threshold"] = similarity_threshold

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._client.api_key}",
        }
        try:
            resp = self._client._http_client.post(
                target_endpoint,
                headers=headers,
                json=payload,
            )
            if resp.status_code >= 400:
                raise MemoLMError(f"Cache inspect failed ({resp.status_code}): {resp.text}", status_code=resp.status_code)
            return resp.json()
        except httpx.RequestError as exc:
            raise GatewayUnavailableError(f"Failed to connect to MemoLM Gateway: {exc}") from exc

    def seed(
        self,
        items: List[Union[QAPair, Dict[str, Any]]],
    ) -> Dict[str, Any]:
        """
        Bulk warm-up known documentation or FAQ entries directly into the vector store.
        """
        target_endpoint = f"{self._client.base_url}/cache/seed"
        serialized = []
        for item in items:
            if isinstance(item, QAPair):
                serialized.append(item.model_dump())
            elif isinstance(item, dict):
                serialized.append(item)
            else:
                serialized.append(dict(item))

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._client.api_key}",
        }
        try:
            resp = self._client._http_client.post(
                target_endpoint,
                headers=headers,
                json={"items": serialized},
            )
            if resp.status_code >= 400:
                raise MemoLMError(f"Cache seed failed ({resp.status_code}): {resp.text}", status_code=resp.status_code)
            return resp.json()
        except httpx.RequestError as exc:
            raise GatewayUnavailableError(f"Failed to connect to MemoLM Gateway: {exc}") from exc


class AsyncCacheClient:
    """Asynchronous Cache Management API."""

    def __init__(self, client: Any) -> None:
        self._client = client

    async def invalidate(
        self,
        version: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        target_endpoint = f"{self._client.base_url}/cache/invalidate"
        payload: Dict[str, Any] = {}
        if version is not None:
            payload["version"] = version
        if tenant_id is not None:
            payload["tenant_id"] = tenant_id

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._client.api_key}",
        }
        try:
            resp = await self._client._http_client.post(
                target_endpoint,
                headers=headers,
                json=payload,
            )
            if resp.status_code >= 400:
                raise MemoLMError(f"Cache invalidation failed ({resp.status_code}): {resp.text}", status_code=resp.status_code)
            return resp.json()
        except httpx.RequestError as exc:
            raise GatewayUnavailableError(f"Failed to connect to MemoLM Gateway: {exc}") from exc

    async def inspect(
        self,
        query: str,
        version: Optional[str] = None,
        tenant_id: Optional[str] = None,
        risk: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
    ) -> Dict[str, Any]:
        target_endpoint = f"{self._client.base_url}/cache/inspect"
        payload: Dict[str, Any] = {
            "query": query,
            "tenant_id": tenant_id or self._client.default_tenant,
            "version": version or self._client.default_knowledge_version,
            "risk": risk or self._client.default_risk,
        }
        if similarity_threshold is not None:
            payload["similarity_threshold"] = similarity_threshold

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._client.api_key}",
        }
        try:
            resp = await self._client._http_client.post(
                target_endpoint,
                headers=headers,
                json=payload,
            )
            if resp.status_code >= 400:
                raise MemoLMError(f"Cache inspect failed ({resp.status_code}): {resp.text}", status_code=resp.status_code)
            return resp.json()
        except httpx.RequestError as exc:
            raise GatewayUnavailableError(f"Failed to connect to MemoLM Gateway: {exc}") from exc

    async def seed(
        self,
        items: List[Union[QAPair, Dict[str, Any]]],
    ) -> Dict[str, Any]:
        target_endpoint = f"{self._client.base_url}/cache/seed"
        serialized = []
        for item in items:
            if isinstance(item, QAPair):
                serialized.append(item.model_dump())
            elif isinstance(item, dict):
                serialized.append(item)
            else:
                serialized.append(dict(item))

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._client.api_key}",
        }
        try:
            resp = await self._client._http_client.post(
                target_endpoint,
                headers=headers,
                json={"items": serialized},
            )
            if resp.status_code >= 400:
                raise MemoLMError(f"Cache seed failed ({resp.status_code}): {resp.text}", status_code=resp.status_code)
            return resp.json()
        except httpx.RequestError as exc:
            raise GatewayUnavailableError(f"Failed to connect to MemoLM Gateway: {exc}") from exc

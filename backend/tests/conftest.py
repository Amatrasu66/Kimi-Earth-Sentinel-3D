import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("DISABLE_SCHEDULER", "1")

from app import create_app  # noqa: E402


@pytest.fixture()
def client():
    app = create_app()
    app.config.update({"TESTING": True})
    with app.test_client() as client:
        yield client


@pytest.fixture()
def app():
    """App instance for tests needing app context or extension access."""
    app = create_app()
    app.config.update({"TESTING": True})
    return app


@pytest.fixture()
def live_client():
    """Client with exception propagation disabled, like production.

    TESTING=True makes Flask re-raise view exceptions; this fixture
    exercises the JSON 500 handler instead.
    """
    app = create_app()
    app.config.update({"TESTING": True, "PROPAGATE_EXCEPTIONS": False})
    with app.test_client() as client:
        yield client

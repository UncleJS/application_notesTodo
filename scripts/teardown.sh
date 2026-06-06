#!/usr/bin/env bash
# Full teardown — removes runtime artifacts BEFORE unit files (skill order),
# strictly project-scoped, never prunes.
#
#   1. stop units                 4. remove Quadlet files + daemon-reload
#   2. disable + reset-failed     5. (--purge) remove named volumes — DATA LOSS
#   3. rm pod/containers/images      and the shared mariadb:11 image
#
# Usage: scripts/teardown.sh [--purge] [--yes]
#   --purge  ALSO delete the named volumes (notestodo-mariadb = the database!)
#            and the docker.io/library/mariadb:11 image
#   --yes    skip the confirmation prompt

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PURGE=false
YES=false
for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=true ;;
    --yes) YES=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

echo "This will stop and remove the ${PROJECT_NAME} pod, containers, images and Quadlet units."
$PURGE && echo "WITH --purge: the named volumes (INCLUDING THE DATABASE) and the mariadb:11 image are deleted."
if ! $YES; then
  read -r -p "Continue? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Aborted."; exit 1; }
fi

stop_units
disable_units
remove_runtime
remove_quadlet_files

if $PURGE; then
  purge_volumes
  purge_shared_images
  echo "Teardown complete — volumes and shared images purged."
else
  echo "Teardown complete — named volumes kept (re-run with --purge to delete data)."
fi

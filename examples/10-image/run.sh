#!/bin/bash
set -x
rm -rf out/10-image
rm -rf .tmp

./examples/10-image/run-prompt-2-teaser.sh
#./examples/10-image/run-prompt-3-teaser2.sh
#./examples/10-image/run-prompt-4-booking-form-json-data.sh
#./examples/10-image/run-10-icon.sh
#./examples/10-image/run-prompt-4-booking-form.sh
#./examples/10-image/run-prompt-6-dashboard.sh


echo "All done."

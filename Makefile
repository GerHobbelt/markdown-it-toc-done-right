PATH        := ./node_modules/.bin:${PATH}

NPM_PACKAGE := $(shell support/getGlobalName.js package)
NPM_VERSION := $(shell support/getGlobalName.js version)

GLOBAL_NAME := $(shell support/getGlobalName.js global)
BUNDLE_NAME := $(shell support/getGlobalName.js microbundle)

TMP_PATH    := /tmp/${NPM_PACKAGE}-$(shell date +%s)

REMOTE_NAME ?= origin
REMOTE_REPO ?= $(shell git config --get remote.${REMOTE_NAME}.url)

CURR_HEAD   := $(firstword $(shell git show-ref --hash HEAD | cut -b -6) master)
GITHUB_PROJ := https://github.com//GerHobbelt/${NPM_PACKAGE}


build: lint bundle bundle_demo test coverage todo

lint:
	eslint .

lintfix:
	eslint --fix .

bundle:
	-rm -rf ./dist
	mkdir dist
	microbundle --no-compress --target node --strict --name ${GLOBAL_NAME}
	npx prepend-header 'dist/*js' support/header.js

bundle_demo:
	rm -rf demo/assets
	cd demo && \
		npx microbundle --entry ./helper.js -o assets --target web --no-compress --format iife --external none --raw --no-sourcemap
	npx prepend-header 'demo/assets/*.js' support/header.js

test:
	jest

coverage:
	-rm -rf coverage
	-rm -rf .nyc_output
	jest --coverage

report-coverage: lint coverage


publish:
	@if test 0 -ne `git status --porcelain | wc -l` ; then \
		echo "Unclean working tree. Commit or stash changes first." >&2 ; \
		exit 128 ; \
		fi
	@if test 0 -ne `git fetch ; git status | grep '^# Your branch' | wc -l` ; then \
		echo "Local/Remote history differs. Please push/pull changes." >&2 ; \
		exit 128 ; \
		fi
	@if test 0 -ne `git tag -l ${NPM_VERSION} | wc -l` ; then \
		echo "Tag ${NPM_VERSION} exists. Update package.json" >&2 ; \
		exit 128 ; \
		fi
	git tag ${NPM_VERSION} && git push origin ${NPM_VERSION}
	npm run pub

todo:
	@echo ""
	@echo "TODO list"
	@echo "---------"
	@echo ""
	grep 'TODO' -n -r ./ --exclude-dir=node_modules --exclude-dir=unicode-homographs --exclude-dir=dist --exclude-dir=coverage --exclude=Makefile 2>/dev/null || test true

clean:
	-rm -rf ./coverage/
	-rm -rf ./dist/
	-rm -rf ./.nyc_output/
	-rm -rf ./demo/assets/

superclean: clean
	-rm -rf ./node_modules/
	-rm -f ./package-lock.json

prep: superclean
	-ncu -a --packageFile=package.json
	-npm install
	-npm audit fix



upddemo:
	rm -rf ./lib
	mkdir lib
	curl -o lib/markdown-it-anchor.js https://wzrd.in/standalone/markdown-it-anchor@latest
	curl -o lib/uslug.js https://wzrd.in/standalone/uslug@latest


.PHONY: clean superclean prep publish lint fix test todo coverage report-coverage doc build gh-doc bundle bundle_demo
.SILENT: help lint test todo

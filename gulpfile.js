var gulp = require("gulp");
var source = require("vinyl-source-stream");
var browserify = require("browserify");

gulp.task('browserify', function() {
    return browserify('./client.js', {
            transform:["hbsfy"]
        })
        .bundle()
        //Pass desired output filename to vinyl-source-stream
        .pipe(source('index.js'))
        // Start piping stream to tasks!
        .pipe(gulp.dest('./public/'));
});

gulp.task("default", ["browserify"]);